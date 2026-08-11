import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { queueActivity } from '../lib/activityLog.js';



const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '24h';

const JAMSTART_DOMAIN = '@jamstart.com';

const normalizeNamePart = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildGeneratedCredentials = (firstName, lastName) => {
  const normalizedFirstName = normalizeNamePart(firstName);
  const normalizedLastName = normalizeNamePart(lastName);

  if (!normalizedFirstName || !normalizedLastName) {
    return { email: '', password: '' };
  }

  return {
    email: `${normalizedFirstName[0]}${normalizedLastName}${JAMSTART_DOMAIN}`,
    password: `${normalizedFirstName[0]}${normalizedLastName}`,
  };
};

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, suffix, email, password } = req.body;
 
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    const generatedCredentials = buildGeneratedCredentials(first_name, last_name);
    const finalEmail = (email || generatedCredentials.email).trim();
    const finalPassword = password || generatedCredentials.password;

    if (!finalEmail || !finalPassword) {
      return res.status(400).json({ error: 'Could not generate credentials from the provided name' });
    }

    if (finalPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: finalEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    const user = await prisma.user.   create({
      data: {
        first_name,
        middle_name: middle_name || null,
        last_name,
        suffix: suffix || null,
        email: finalEmail,
        password: hashedPassword,
      },
    });

    queueActivity(res, {
      actor: user.email,
      action: 'Registered user',
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
        suffix: user.suffix,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    queueActivity(res, {
      actor: user.email,
      action: 'Logged in',
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
        suffix: user.suffix,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────
// JWTs are stateless — there's nothing to invalidate server-side without a
// token blacklist (extra complexity most single-owner apps don't need).
// The frontend just deletes the token from localStorage; this endpoint exists
// mainly so you have a consistent place to log the action.
export const logout = async (req, res) => {
  try {
    queueActivity(res, {
      actor: req.user?.email || 'unknown',
      action: 'Logged out',
    });
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// ─────────────────────────────────────────────
// GET CURRENT USER (useful for the frontend to verify a token on page refresh)
// ─────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        first_name: true,
        middle_name: true,
        last_name: true,
        suffix: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};