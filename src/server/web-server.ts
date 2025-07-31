import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FILESYSTEM, LOG_PREFIXES } from '../config/constants';

export interface DownloadToken {
  filePath: string;
  expiresAt: Date;
  sessionFolderName: string;
}

export class WebServer {
  private app: express.Application;
  private server: any;
  private downloadTokens: Map<string, DownloadToken> = new Map();
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

    // Session overview endpoint (optional)
    this.app.get('/session/:sessionId', (req: Request, res: Response) => {
      this.handleSessionOverview(req, res);
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

    if (!fs.existsSync(tokenData.filePath)) {
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

      // Stream the file
      const fileStream = fs.createReadStream(tokenData.filePath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        console.error(`${LOG_PREFIXES.ERROR} Error streaming file:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error reading file' });
        }
      });

      console.log(`${LOG_PREFIXES.SUCCESS} Downloaded: ${filename} (session: ${tokenData.sessionFolderName})`);

    } catch (error) {
      console.error(`${LOG_PREFIXES.ERROR} Download error:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private handleSessionOverview(req: Request, res: Response): void {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ error: 'Missing session ID' });
      return;
    }

    const sessionPath = path.join(process.cwd(), FILESYSTEM.RECORDINGS_DIR, sessionId);
    
    if (!fs.existsSync(sessionPath)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const files = fs.readdirSync(sessionPath);
      const sessionFiles = {
        mixedTimeline: files.includes(FILESYSTEM.MIXED_TIMELINE_FILENAME),
        transcript: files.includes(FILESYSTEM.TRANSCRIPT_FILENAME),
        summary: files.includes(FILESYSTEM.SUMMARY_FILENAME),
        audioClips: files.filter(f => f.endsWith(FILESYSTEM.AUDIO_EXTENSION) && !f.startsWith('mixed_')).length
      };

      res.json({
        sessionId,
        files: sessionFiles,
        availableFiles: files
      });

    } catch (error) {
      console.error(`${LOG_PREFIXES.ERROR} Session overview error:`, error);
      res.status(500).json({ error: 'Error reading session' });
    }
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