import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class TokenAuthGuard implements CanActivate {
  constructor(private readonly token: string) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.token) {
      return false;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    const authHeader =
      request.headers['authorization'] ?? request.headers['Authorization'];

    return authHeader === `Bearer ${this.token}`;
  }
}
