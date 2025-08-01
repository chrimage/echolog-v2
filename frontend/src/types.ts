export interface SessionData {
  sessionId: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  duration: string;
  participantCount: number;
  files: {
    mixedTimeline: boolean;
    transcript: boolean;
    summary: boolean;
    audioClips: number;
  };
}

export interface ArtifactResponse {
  content: string;
  downloadUrl: string;
}

export type TabType = 'audio' | 'transcript' | 'summary';