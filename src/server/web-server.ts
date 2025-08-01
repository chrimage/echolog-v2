import express, { Request, Response } from 'express';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'http';
import { FILESYSTEM, LOG_PREFIXES } from '../config/constants';
import { validateSessionId, validateToken, validateArtifactType } from '../utils/validation';

export interface DownloadToken {
  filePath: string;
  expiresAt: Date;
  sessionFolderName: string;
}

export interface ViewerToken {
  sessionFolderName: string;
  expiresAt: Date;
  sessionPath: string;
}

export class WebServer {
  private app: express.Application;
  private server: Server | null = null;
  private downloadTokens: Map<string, DownloadToken> = new Map();
  private viewerTokens: Map<string, ViewerToken> = new Map();
  private port: number;
  private baseUrl: string;

  constructor(port: number = 3000, externalUrl?: string) {
    this.port = port;
    // Use external URL if provided, otherwise default to localhost
    this.baseUrl = externalUrl || `http://localhost:${port}`;
    this.app = express();
    this.setupRoutes();
    this.setupCleanupInterval();
  }

  private setupRoutes(): void {
    // Security headers middleware
    this.app.use((req: Request, res: Response, next) => {
      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "media-src 'self'; " +
        "connect-src 'self'; " +
        "font-src 'self'"
      );
      
      // CORS headers (restrictive by default)
      res.setHeader('Access-Control-Allow-Origin', this.baseUrl);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
      
      next();
    });

    // Handle CORS preflight requests
    this.app.options('*', (req: Request, res: Response) => {
      res.status(204).send();
    });

    // Serve static frontend files
    this.app.use(express.static(path.join(process.cwd(), 'dist/public')));
    this.app.use(express.json({ limit: '1mb' })); // Limit JSON payload size

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Test endpoint for container verification
    this.app.get('/test', (req: Request, res: Response) => {
      res.json({ 
        message: 'EchoLog v2 Discord Bot is running!',
        status: 'container_ready',
        timestamp: new Date().toISOString(),
        port: this.port,
        baseUrl: this.baseUrl
      });
    });

    // Secure download endpoint
    this.app.get('/download/:token/:filename', (req: Request, res: Response) => {
      this.handleDownload(req, res);
    });

    // Viewer page endpoint
    this.app.get('/viewer/:viewerToken', (req: Request, res: Response) => {
      this.handleViewerPage(req, res);
    });

    // API endpoints
    this.app.get('/api/session/:sessionId', (req: Request, res: Response) => {
      this.handleSessionAPI(req, res);
    });

    this.app.get('/api/viewer/:viewerToken', (req: Request, res: Response) => {
      this.handleViewerSessionAPI(req, res);
    });

    this.app.get('/api/artifact/:sessionId/:type', (req: Request, res: Response) => {
      this.handleArtifactAPI(req, res);
    });

    // Session overview endpoint (legacy)
    this.app.get('/session/:sessionId', (req: Request, res: Response) => {
      this.handleSessionOverview(req, res);
    });

    // Catch-all for SPA routing
    this.app.get('/viewer/*', (req: Request, res: Response) => {
      res.sendFile(path.join(process.cwd(), 'dist/public/index.html'));
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  private handleDownload(req: Request, res: Response): void {
    const { token, filename } = req.params;

    if (!token || !filename) {
      res.status(400).json({ error: 'Missing token or filename' });
      return;
    }

    // Validate token format
    if (!validateToken(token)) {
      res.status(400).json({ error: 'Invalid token format' });
      return;
    }

    const tokenData = this.downloadTokens.get(token);
    if (!tokenData) {
      res.status(404).json({ error: 'Invalid or expired token' });
      return;
    }

    if (new Date() > tokenData.expiresAt) {
      this.downloadTokens.delete(token);
      res.status(410).json({ error: 'Token expired' });
      return;
    }

    if (!fsSync.existsSync(tokenData.filePath)) {
      console.warn(`${LOG_PREFIXES.WARNING} File not found for download: ${tokenData.filePath}`);
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify filename matches what was requested (security)
    const actualFilename = path.basename(tokenData.filePath);
    if (actualFilename !== filename) {
      res.status(400).json({ error: 'Filename mismatch' });
      return;
    }

    try {
      // Set appropriate headers
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';
      
      if (ext === '.ogg') {
        contentType = 'audio/ogg';
      } else if (ext === '.md') {
        contentType = 'text/markdown';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Session', tokenData.sessionFolderName);

      // Stream the file with proper error handling
      const fileStream = fsSync.createReadStream(tokenData.filePath);
      
      fileStream.on('error', (error) => {
        console.error(`${LOG_PREFIXES.ERROR} Error streaming file:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error reading file' });
        }
      });

      // Handle client disconnect
      req.on('aborted', () => {
        fileStream.destroy();
      });

      fileStream.pipe(res);

      console.log(`${LOG_PREFIXES.SUCCESS} Downloaded: ${filename} (session: ${tokenData.sessionFolderName})`);

    } catch (error) {
      console.error(`${LOG_PREFIXES.ERROR} Download error:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleSessionOverview(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ error: 'Missing session ID' });
      return;
    }

    // Validate session ID to prevent path traversal
    const validSessionId = validateSessionId(sessionId);
    if (!validSessionId) {
      res.status(400).json({ error: 'Invalid session ID format' });
      return;
    }

    const sessionPath = path.join(process.cwd(), FILESYSTEM.RECORDINGS_DIR, validSessionId);
    
    try {
      // Check if session directory exists
      await fs.access(sessionPath);
      
      const files = await fs.readdir(sessionPath);
      const sessionFiles = {
        mixedTimeline: files.includes(FILESYSTEM.MIXED_TIMELINE_FILENAME),
        transcript: files.includes(FILESYSTEM.TRANSCRIPT_FILENAME),
        summary: files.includes(FILESYSTEM.SUMMARY_FILENAME),
        audioClips: files.filter((f: string) => f.endsWith(FILESYSTEM.AUDIO_EXTENSION) && !f.startsWith('mixed_')).length
      };

      res.json({
        sessionId: validSessionId,
        files: sessionFiles,
        availableFiles: files
      });

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Session not found' });
      } else {
        console.error(`${LOG_PREFIXES.ERROR} Session overview error:`, error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private handleViewerPage(req: Request, res: Response): void {
    const { viewerToken } = req.params;
    
    if (!viewerToken) {
      res.status(400).json({ error: 'Missing viewer token' });
      return;
    }

    // Validate token format
    if (!validateToken(viewerToken)) {
      res.status(400).json({ error: 'Invalid token format' });
      return;
    }

    const tokenData = this.viewerTokens.get(viewerToken);
    if (!tokenData) {
      res.status(404).json({ error: 'Invalid or expired viewer token' });
      return;
    }

    if (new Date() > tokenData.expiresAt) {
      this.viewerTokens.delete(viewerToken);
      res.status(410).json({ error: 'Viewer token expired' });
      return;
    }

    // Serve the React app
    res.sendFile(path.join(process.cwd(), 'dist/public/index.html'));
  }

  private async handleViewerSessionAPI(req: Request, res: Response): Promise<void> {
    const { viewerToken } = req.params;
    
    if (!viewerToken) {
      res.status(400).json({ error: 'Missing viewer token' });
      return;
    }

    // Validate token format
    if (!validateToken(viewerToken)) {
      res.status(400).json({ error: 'Invalid token format' });
      return;
    }

    const tokenData = this.viewerTokens.get(viewerToken);
    if (!tokenData) {
      res.status(404).json({ error: 'Invalid or expired viewer token' });
      return;
    }

    if (new Date() > tokenData.expiresAt) {
      this.viewerTokens.delete(viewerToken);
      res.status(410).json({ error: 'Viewer token expired' });
      return;
    }

    // Use the session folder name from the token to get session data
    const sessionId = tokenData.sessionFolderName;
    const sessionPath = path.join(process.cwd(), FILESYSTEM.RECORDINGS_DIR, sessionId);
    
    try {
      // Check if session directory exists
      const stats = await fs.stat(sessionPath);
      if (!stats.isDirectory()) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Read directory contents asynchronously
      const files = await fs.readdir(sessionPath);
      const sessionFiles = {
        mixedTimeline: files.includes(FILESYSTEM.MIXED_TIMELINE_FILENAME),
        transcript: files.includes(FILESYSTEM.TRANSCRIPT_FILENAME),
        summary: files.includes(FILESYSTEM.SUMMARY_FILENAME),
        audioClips: files.filter(f => f.endsWith(FILESYSTEM.AUDIO_EXTENSION) && !f.startsWith('mixed_')).length
      };

      const sessionData = {
        sessionId,
        sessionName: sessionId, // Use folder name as session name
        startTime: stats.birthtime.toISOString(),
        endTime: stats.mtime.toISOString(),
        duration: this.formatDuration(stats.mtime.getTime() - stats.birthtime.getTime()),
        participantCount: sessionFiles.audioClips, // Rough estimate
        files: sessionFiles
      };

      res.json(sessionData);

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Session not found' });
      } else {
        console.error(`${LOG_PREFIXES.ERROR} Viewer Session API error:`, error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private async handleSessionAPI(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ error: 'Missing session ID' });
      return;
    }

    // Validate and sanitize session ID to prevent path traversal
    const validSessionId = validateSessionId(sessionId);
    if (!validSessionId) {
      res.status(400).json({ error: 'Invalid session ID format' });
      return;
    }

    const sessionPath = path.join(process.cwd(), FILESYSTEM.RECORDINGS_DIR, validSessionId);
    
    try {
      // Check if session directory exists
      const stats = await fs.stat(sessionPath);
      if (!stats.isDirectory()) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Read directory contents asynchronously
      const files = await fs.readdir(sessionPath);
      const sessionFiles = {
        mixedTimeline: files.includes(FILESYSTEM.MIXED_TIMELINE_FILENAME),
        transcript: files.includes(FILESYSTEM.TRANSCRIPT_FILENAME),
        summary: files.includes(FILESYSTEM.SUMMARY_FILENAME),
        audioClips: files.filter(f => f.endsWith(FILESYSTEM.AUDIO_EXTENSION) && !f.startsWith('mixed_')).length
      };

      const sessionData = {
        sessionId: validSessionId,
        sessionName: validSessionId, // Use folder name as session name
        startTime: stats.birthtime.toISOString(),
        endTime: stats.mtime.toISOString(),
        duration: this.formatDuration(stats.mtime.getTime() - stats.birthtime.getTime()),
        participantCount: sessionFiles.audioClips, // Rough estimate
        files: sessionFiles
      };

      res.json(sessionData);

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Session not found' });
      } else {
        console.error(`${LOG_PREFIXES.ERROR} Session API error:`, error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private async handleArtifactAPI(req: Request, res: Response): Promise<void> {
    const { sessionId, type } = req.params;
    
    if (!sessionId || !type) {
      res.status(400).json({ error: 'Missing session ID or artifact type' });
      return;
    }

    // Validate inputs
    const validSessionId = validateSessionId(sessionId);
    if (!validSessionId) {
      res.status(400).json({ error: 'Invalid session ID format' });
      return;
    }

    if (!validateArtifactType(type)) {
      res.status(400).json({ error: 'Invalid artifact type' });
      return;
    }

    const sessionPath = path.join(process.cwd(), FILESYSTEM.RECORDINGS_DIR, validSessionId);
    
    let filename: string;
    let contentType: string;
    
    switch (type) {
      case 'transcript':
        filename = FILESYSTEM.TRANSCRIPT_FILENAME;
        contentType = 'text/markdown';
        break;
      case 'summary':
        filename = FILESYSTEM.SUMMARY_FILENAME;
        contentType = 'text/markdown';
        break;
      case 'audio':
        filename = FILESYSTEM.MIXED_TIMELINE_FILENAME;
        contentType = 'audio/ogg';
        break;
    }

    const filePath = path.join(sessionPath, filename);
    
    try {
      // Check if file exists
      await fs.access(filePath);

      if (type === 'audio') {
        // For audio, stream the file directly with proper error handling
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        
        const fileStream = fsSync.createReadStream(filePath);
        
        // Handle stream errors
        fileStream.on('error', (error) => {
          console.error(`${LOG_PREFIXES.ERROR} Error streaming audio:`, error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error streaming audio' });
          }
        });

        // Handle client disconnect
        req.on('aborted', () => {
          fileStream.destroy();
        });

        fileStream.pipe(res);
      } else {
        // For text files, return content and download URL
        const content = await fs.readFile(filePath, 'utf-8');
        const downloadToken = this.generateDownloadToken(filePath, validSessionId, 48);
        const downloadUrl = this.generateDownloadUrl(downloadToken, filename);
        
        res.json({
          content,
          downloadUrl
        });
      }

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Artifact not found' });
      } else {
        console.error(`${LOG_PREFIXES.ERROR} Artifact API error:`, error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private formatDuration(milliseconds: number): string {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  private setupCleanupInterval(): void {
    // Clean up expired tokens every hour
    setInterval(() => {
      const now = new Date();
      for (const [token, data] of this.downloadTokens.entries()) {
        if (now > data.expiresAt) {
          this.downloadTokens.delete(token);
        }
      }
      for (const [token, data] of this.viewerTokens.entries()) {
        if (now > data.expiresAt) {
          this.viewerTokens.delete(token);
        }
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  public generateDownloadToken(filePath: string, sessionFolderName: string, expiryHours: number = 48): string {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    this.downloadTokens.set(token, {
      filePath,
      expiresAt,
      sessionFolderName
    });

    return token;
  }

  public generateDownloadUrl(token: string, filename: string): string {
    return `${this.baseUrl}/download/${token}/${filename}`;
  }

  public generateViewerToken(sessionFolderName: string, expiryHours: number = 48): string {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    const sessionPath = path.join(process.cwd(), FILESYSTEM.RECORDINGS_DIR, sessionFolderName);

    this.viewerTokens.set(token, {
      sessionFolderName,
      expiresAt,
      sessionPath
    });

    return token;
  }

  public generateViewerUrl(token: string): string {
    return `${this.baseUrl}/viewer/${token}`;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`${LOG_PREFIXES.SUCCESS} Web server started on ${this.baseUrl}`);
        resolve();
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`${LOG_PREFIXES.ERROR} Port ${this.port} is already in use`);
        } else {
          console.error(`${LOG_PREFIXES.ERROR} Web server error:`, error);
        }
        reject(error);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log(`${LOG_PREFIXES.STOP} Web server stopped`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getTokenCount(): number {
    return this.downloadTokens.size;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }
}