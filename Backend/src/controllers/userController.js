import prisma from '../lib/prisma.js';

const publicUserFields = {
  id: true,
  first_name: true,
  middle_name: true,
  last_name: true,
  suffix: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
};

export const getUsers = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const allowedStatus = ['active', 'inactive', 'all'];
    if (status !== undefined && !allowedStatus.includes(status)) {
      return res.status(400).json({
        error: `Invalid status "${status}". Must be one of: ${allowedStatus.join(', ')}`,
      });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: 'page must be a positive number' });
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ error: 'limit must be between 1 and 100' });
    }

    const where = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const totalUsers = await prisma.user.count({ where });

    const users = await prisma.user.findMany({
      where,
      select: publicUserFields,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    res.json({
      status: status || 'all',
      page: pageNum,
      limit: limitNum,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limitNum),
      users,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id, 10) },
      select: publicUserFields,
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, middle_name, last_name, suffix, email, role } = req.body;

    const existing = await prisma.user.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email && email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) {
        return res.status(400).json({ error: 'Email already in use by another account' });
      }
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id, 10) },
      data: {
        ...(first_name !== undefined && { first_name }),
        ...(middle_name !== undefined && { middle_name }),
        ...(last_name !== undefined && { last_name }),
        ...(suffix !== undefined && { suffix }),
        ...(email !== undefined && { email }),
        ...(role !== undefined && { role }),
      },
      select: publicUserFields,
    });

    res.json({ message: 'User updated', user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Archive = soft delete. Sets isActive to false instead of removing the row,
// so the user disappears from active lists but their history (logs, etc.)
// created while logged in stays intact.
export const archiveUser = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.user.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user.userId === existing.id) {
      return res.status(400).json({ error: 'You cannot archive your own account' });
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id, 10) },
      data: { isActive: false },
      select: publicUserFields,
    });

    await prisma.log.create({
      data: {
        name: req.user.email,
        action: `Archived user: ${existing.email}`,
      },
    });

    res.json({ message: 'User archived', user });
  } catch (error) {
    console.error('Archive user error:', error);
    res.status(500).json({ error: 'Failed to archive user' });
  }
};

export const restoreUser = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.user.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id, 10) },
      data: { isActive: true },
      select: publicUserFields,
    });

    await prisma.log.create({
      data: {
        name: req.user.email,
        action: `Restored user: ${existing.email}`,
      },
    });

    res.json({ message: 'User restored', user });
  } catch (error) {
    console.error('Restore user error:', error);
    res.status(500).json({ error: 'Failed to restore user' });
  }
};