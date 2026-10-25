import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDbPool, sql } from '../config/db';
import { generateToken, authMiddleware } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message });
      return;
    }

    const { name, email, password } = parse.data;
    const pool = await getDbPool();

    // Check if user already exists
    const existing = await pool
      .request()
      .input('Email', sql.NVarChar, email.toLowerCase())
      .query('SELECT UserId FROM Users WHERE Email = @Email');

    if (existing.recordset.length > 0) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const userId = uuidv4();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .input('Name', sql.NVarChar, name.trim())
      .input('Email', sql.NVarChar, email.toLowerCase().trim())
      .input('PasswordHash', sql.NVarChar, passwordHash)
      .input('Role', sql.NVarChar, 'patient')
      .query(`
        INSERT INTO Users (UserId, Name, Email, PasswordHash, Role, CreatedAt, UpdatedAt)
        VALUES (@UserId, @Name, @Email, @PasswordHash, @Role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
      `);

    const userPayload = {
      userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      role: 'patient',
    };

    const token = generateToken(userPayload);

    // Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: 'Account created successfully',
      user: userPayload,
      token,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed due to server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message });
      return;
    }

    const { email, password } = parse.data;
    const pool = await getDbPool();

    const result = await pool
      .request()
      .input('Email', sql.NVarChar, email.toLowerCase().trim())
      .query('SELECT UserId, Name, Email, PasswordHash, Role FROM Users WHERE Email = @Email');

    if (result.recordset.length === 0) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const userRow = result.recordset[0];
    const match = await bcrypt.compare(password, userRow.PasswordHash);
    if (!match) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const userPayload = {
      userId: userRow.UserId,
      email: userRow.Email,
      name: userRow.Name,
      role: userRow.Role,
    };

    const token = generateToken(userPayload);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Logged in successfully',
      user: userPayload,
      token,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed due to server error.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
  });
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query('SELECT UserId, Name, Email, Role, CreatedAt FROM Users WHERE UserId = @UserId');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const u = result.recordset[0];
    res.json({
      user: {
        userId: u.UserId,
        name: u.Name,
        email: u.Email,
        role: u.Role,
        createdAt: u.CreatedAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch current user' });
  }
});

export default router;
