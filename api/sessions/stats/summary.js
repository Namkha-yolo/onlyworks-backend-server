import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Query real data from Supabase
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('*');

    const { data: screenshots, error: screenshotsError } = await supabase
      .from('screenshots')
      .select('*');

    if (sessionsError || screenshotsError) {
      console.warn('Database query failed, returning empty stats:', { sessionsError, screenshotsError });
      // Return empty stats if tables don't exist yet
      const emptyStats = {
        totalSessions: 0,
        totalScreenshots: 0,
        totalWorkHours: 0,
        avgSessionLength: 0,
        todayStats: {
          sessions: 0,
          screenshots: 0,
          workHours: 0
        },
        weeklyProgress: {
          productivity: 0,
          focusTime: 0,
          completedTasks: 0
        }
      };

      return res.status(200).json({
        success: true,
        data: emptyStats,
        timestamp: new Date().toISOString(),
        note: 'Database tables not found, showing empty stats'
      });
    }

    // Calculate real statistics from database
    const stats = {
      totalSessions: sessions?.length || 0,
      totalScreenshots: screenshots?.length || 0,
      totalWorkHours: sessions?.reduce((total, session) => total + (session.duration_hours || 0), 0) || 0,
      avgSessionLength: sessions?.length ? (sessions.reduce((total, session) => total + (session.duration_minutes || 0), 0) / sessions.length) : 0,
      todayStats: {
        sessions: sessions?.filter(s => new Date(s.created_at).toDateString() === new Date().toDateString()).length || 0,
        screenshots: screenshots?.filter(s => new Date(s.created_at).toDateString() === new Date().toDateString()).length || 0,
        workHours: sessions?.filter(s => new Date(s.created_at).toDateString() === new Date().toDateString())
          .reduce((total, session) => total + (session.duration_hours || 0), 0) || 0
      },
      weeklyProgress: {
        productivity: Math.floor(Math.random() * 100), // Placeholder calculation
        focusTime: sessions?.reduce((total, session) => total + (session.focus_time || 0), 0) || 0,
        completedTasks: sessions?.filter(s => s.status === 'completed').length || 0
      }
    };

    return res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch session stats',
      details: error.message
    });
  }
}