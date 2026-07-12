export {};

declare global {
  interface CustomJwtSessionClaims {
    email: string;
    username?: string;
  }
}
