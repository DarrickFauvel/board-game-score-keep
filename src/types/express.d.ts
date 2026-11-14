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
      /** The group being viewed (see middleware/group.ts); set on signed-in routes. */
      group: import('../services/groupService.js').GroupSummary;
      /** All the person's groups, for the header switcher. */
      groups: import('../services/groupService.js').GroupSummary[];
    }
    interface Response {
      renderEta: (template: string, data?: Record<string, unknown>) => void;
    }
  }
}

export {};
