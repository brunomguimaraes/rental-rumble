/** Known gameplay rejections roll back every part of the command. */
export class RouteError extends Error {
  constructor(public status: number, message: string, public party?: string[]) { super(message); }
}

export const fail = (status: number, message: string): never => { throw new RouteError(status, message); };
