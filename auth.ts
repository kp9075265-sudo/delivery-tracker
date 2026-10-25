import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getPool } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const email = typeof credentials.email === "string"
          ? credentials.email.trim().toLowerCase()
          : "";
        const password = typeof credentials.password === "string"
          ? credentials.password
          : "";

        if (!email || !password || email.length > 254 || password.length > 128) {
          return null;
        }

        const result = await getPool().query(
          `SELECT user_id, email, password_hash
           FROM app_users
           WHERE email = $1
           LIMIT 1`,
          [email]
        );
        const account = result.rows[0];
        if (!account || !(await verifyPassword(password, account.password_hash))) {
          return null;
        }

        return {
          id: String(account.user_id),
          name: account.email,
          email: account.email
        };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    }
  }
});
