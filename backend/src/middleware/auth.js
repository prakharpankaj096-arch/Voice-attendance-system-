// Authentication & Authorization Middleware
//
// requireAuth  — verifies the JWT from the Authorization header,
//                attaches req.user = { id, email }
// requireAdmin — must run AFTER requireAuth; checks the admins table

const { supabase } = require('../supabaseClient');

/**
 * Middleware: requireAuth
 * Extracts Bearer token from Authorization header, verifies it with
 * Supabase Auth, and attaches the authenticated user to req.user.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify the JWT using the service-role client (can verify any token)
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired token',
        detail: error?.message,
      });
    }

    // Attach user info to the request for downstream handlers
    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role || data.user.app_metadata?.role || data.user.user_metadata?.role || null,
      user_metadata: data.user.user_metadata || {},
      app_metadata: data.user.app_metadata || {},
      student_id:
        data.user.user_metadata?.student_id ||
        data.user.app_metadata?.student_id ||
        null,
      roll_number: data.user.user_metadata?.roll_number || null,
    };

    next();
  } catch (err) {
    return res.status(401).json({
      status: 'error',
      message: 'Token verification failed',
      detail: err.message,
    });
  }
}

/**
 * Middleware: requireAdmin
 * Must be used AFTER requireAuth. Checks whether the authenticated user
 * exists in the admins table. Returns 403 if not.
 */
async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required before admin check',
    });
  }

  if (
    req.user.role === 'admin' ||
    req.user.app_metadata?.role === 'admin' ||
    req.user.user_metadata?.role === 'admin'
  ) {
    return next();
  }

  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id, role')
      .or(`id.eq.${req.user.id},email.eq.${req.user.email || 'none'}`)
      .maybeSingle();

    if (error || !data) {
      return res.status(403).json({
        status: 'error',
        message: 'You don\'t have admin privileges',
      });
    }

    req.user.role = data.role;
    next();
  } catch (err) {
    return res.status(403).json({
      status: 'error',
      message: 'Admin verification failed',
      detail: err.message,
    });
  }
}

module.exports = { requireAuth, requireAdmin };
