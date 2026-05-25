declare global {
  namespace Express {
    interface Request {
      user: {
        sub: string;
        email: string;
        iat?: number;
        exp?: number;
      };
      uploadFolder?: string;
    }
    interface Response {
      renderEta: (template: string, data?: Record<string, unknown>) => void;
    }
  }
}

export {};
