import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import prisma from './lib/prisma';

import authRoutes from './routes/auth';
import postsRoutes from './routes/posts';
import gardensRoutes from './routes/gardens';
import eventsRoutes from './routes/events';
import gamificationRoutes from './routes/gamification';
import adminRoutes from './routes/admin';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';
const BACKEND_URL = process.env.BACKEND_URL
  || (process.env.NODE_ENV === 'production' ? 'https://agroinova-app-production.up.railway.app' : `http://localhost:${PORT}`);
const DIST_DIR = path.resolve(__dirname, '../frontend-dist');

console.log(`🔗 BACKEND_URL: ${BACKEND_URL}`);

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET!,
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  const user = await prisma.user.findUnique({ where: { id } });
  done(null, user);
});

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: `${BACKEND_URL}/api/auth/google/callback`,
  },
  async (_accessToken, _refreshToken, profile, done) => {
    try {
      console.log('🔐 Google OAuth callback - profile.id:', profile.id, 'email:', profile.emails?.[0]?.value);
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('E-mail não disponível na conta Google'), false);

      let user = await prisma.user.findUnique({ where: { googleId: profile.id } });

      if (!user) {
        user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          console.log('🔗 Linking Google account to existing user:', user.id);
          user = await prisma.user.update({ where: { id: user.id }, data: { googleId: profile.id } });
        } else {
          console.log('✨ Creating new user from Google profile');
          user = await prisma.user.create({
            data: {
              name: profile.displayName,
              email,
              googleId: profile.id,
              avatar: profile.photos?.[0]?.value ?? null,
              role: 'aluno',
              school: 'A definir',
              isAdmin: false,
            },
          });
        }
      }

      console.log('✅ Google OAuth success - userId:', user.id);
      return done(null, user);
    } catch (err) {
      console.error('❌ Google OAuth error:', err);
      return done(err as Error, false);
    }
  }
));

app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/api/auth/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err: any, user: any, info: any) => {
      if (err) {
        console.error('❌ passport.authenticate error:', err);
        return res.redirect(`${FRONTEND_URL}/login?error=google`);
      }
      if (!user) {
        console.error('❌ passport.authenticate no user. info:', info);
        return res.redirect(`${FRONTEND_URL}/login?error=google`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  (req, res) => {
    const user = req.user as any;
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

// Servir imagens de upload como arquivos estáticos
app.use('/uploads', express.static(path.resolve(process.env.UPLOADS_DIR || './uploads')));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/gardens', gardensRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// Servir frontend buildado (produção)
import fs from 'fs';
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🌱 AgroInova Backend rodando em http://localhost:${PORT}`);
  if (fs.existsSync(DIST_DIR)) console.log(`🌐 Frontend servido em http://localhost:${PORT}`);
});
