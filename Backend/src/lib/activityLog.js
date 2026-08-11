import prisma from './prisma.js';

export async function recordActivity({ actor = 'unknown', action }) {
  if (!action) {
    return;
  }

  try {
    await prisma.log.create({
      data: {
        name: actor || 'unknown',
        action,
      },
    });
  } catch (error) {
    console.warn('Activity log write failed:', error);
  }
}

export function queueActivity(res, { actor, action }) {
  if (!res.locals.activityEntries) {
    res.locals.activityEntries = [];
  }

  res.locals.activityEntries.push({
    actor: actor || 'unknown',
    action,
  });
}

const isExcludedPath = (path) => path.startsWith('/api/logs');

const buildFallbackAction = (req) => {
  const path = req.originalUrl.split('?')[0];
  return `${req.method} ${path}`;
};

export function activityLogger(req, res, next) {
  res.on('finish', async () => {
    try {
      if (res.statusCode >= 400 || isExcludedPath(req.originalUrl)) {
        return;
      }

      const entries = res.locals.activityEntries || [];
      const shouldLogFallback = entries.length === 0 && req.method !== 'GET' && req.method !== 'HEAD';

      const activities = shouldLogFallback
        ? [{ actor: req.user?.email || req.body?.email || req.query?.email || 'unknown', action: buildFallbackAction(req) }]
        : entries;

      for (const entry of activities) {
        await recordActivity({
          actor: entry.actor || req.user?.email || 'unknown',
          action: entry.action,
        });
      }
    } catch (error) {
      console.warn('Activity logger failed:', error);
    }
  });

  next();
}