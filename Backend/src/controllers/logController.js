import prisma from '../lib/prisma.js';

export const getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 25, search = '' } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (Number.isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: 'page must be a positive number' });
    }

    if (Number.isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ error: 'limit must be between 1 and 100' });
    }

    const trimmedSearch = String(search).trim();
    const where = trimmedSearch
      ? {
          OR: [
            { name: { contains: trimmedSearch, mode: 'insensitive' } },
            { action: { contains: trimmedSearch, mode: 'insensitive' } },
          ],
        }
      : {};

    const [totalLogs, logs] = await Promise.all([
      prisma.log.count({ where }),
      prisma.log.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
    ]);

    res.json({
      page: pageNum,
      limit: limitNum,
      totalLogs,
      totalPages: Math.ceil(totalLogs / limitNum),
      logs: logs.map((log) => ({
        ...log,
        actor: log.name,
      })),
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
};