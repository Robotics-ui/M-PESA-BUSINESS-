import { type Request, type Response, type NextFunction } from "express";
import { clearSession, getSessionId, getSession, loadAuthUser, type AuthUser } from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const freshUser = await loadAuthUser(session.user.id);
  if (!freshUser) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = freshUser;
  next();
}
