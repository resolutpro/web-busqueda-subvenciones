import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { users } from "../shared/models/auth";
import { eq } from "drizzle-orm";
import { pool } from "./db"; // Asegúrate de exportar tu 'pool' de postgres en db.ts

const PostgresStore = connectPg(session);
const scryptAsync = promisify(scrypt);

// Utilidades de Hashing
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "super_secret_session_key",
      resave: false,
      saveUninitialized: false,
      store: new PostgresStore({ pool, tableName: "sessions" }),
      cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 días
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Credenciales incorrectas" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    if (!user || !user.id) {
      return done(new Error("No se pudo serializar: el usuario no tiene ID"));
    }
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);

      if (!user) {
        // Si el usuario ya no existe (ej. sesión vieja), no crasheamos, 
        // pasamos false para que Passport invalide la sesión de forma limpia.
        return done(null, false); 
      }

      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Rutas de autenticación
  // server/auth.ts

  app.post("/api/register", async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // 1. Verificar si el usuario ya existe
      const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUser) return res.status(400).json({ message: "El usuario ya existe" });

      // 2. Hashear y guardar
      const hashedPassword = await hashPassword(password);

      // IMPORTANTE: .returning() devuelve un array [user]. Extraemos el primer elemento.
      const [newUser] = await db.insert(users).values({ 
        email, 
        password: hashedPassword 
      }).returning();

      // 3. Iniciar sesión con el objeto de usuario recién creado
      req.login(newUser, (err) => {
        if (err) {
          console.error("Error en req.login:", err);
          return next(err);
        }
        return res.status(201).json({ id: newUser.id, email: newUser.email });
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    const user = req.user as any;
    res.json({ id: user.id, email: user.email });
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (req.isAuthenticated()) {
      const user = req.user as any;
      return res.json({ id: user.id, email: user.email });
    }
    res.status(401).send("No autenticado");
  });
}

// Middleware para proteger rutas
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "No autorizado" });
};