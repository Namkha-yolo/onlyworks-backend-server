const BaseRepository = require('./BaseRepository');

class TeamRepository extends BaseRepository {
  constructor() {
    super('teams');
  }

  async createTeam(createdByUserId, teamData) {
    // Generate unique invite code
    const inviteCode = this.generateInviteCode();

    const team = await this.create({
      name: teamData.name,
      description: teamData.description,
      created_by_user_id: createdByUserId,
      invite_code: inviteCode,
      settings: teamData.settings || {}
    });

    // Add creator as admin member
    await this.addMember(team.id, createdByUserId, 'admin');

    return { ...team, invite_code: inviteCode };
  }

  async addMember(teamId, userId, role = 'member') {
    try {
      const { data, error } = await this.supabase
        .from('team_members')
        .insert([{
          team_id: teamId,
          user_id: userId,
          role: role
        }])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async removeMember(teamId, userId, removedByUserId) {
    try {
      // Check if the remover has admin permissions
      const remover = await this.getMember(teamId, removedByUserId);
      if (!remover || remover.role !== 'admin') {
        throw new Error('Insufficient permissions to remove member');
      }

      const { error } = await this.supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  async getMember(teamId, userId) {
    try {
      const { data, error } = await this.supabase
        .from('team_members')
        .select(`
          *,
          users!inner(id, email, display_name, avatar_url)
        `)
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async getTeamMembers(teamId) {
    try {
      const { data, error } = await this.supabase
        .from('team_members')
        .select(`
          *,
          users!inner(id, email, display_name, avatar_url)
        `)
        .eq('team_id', teamId)
        .order('joined_at', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async getUserTeams(userId) {
    try {
      const { data, error } = await this.supabase
        .from('team_members')
        .select(`
          *,
          teams!inner(*)
        `)
        .eq('user_id', userId)
        .order('joined_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data?.map(member => ({
        ...member.teams,
        memberRole: member.role,
        joinedAt: member.joined_at
      })) || [];
    } catch (error) {
      throw error;
    }
  }

  async joinTeamByInviteCode(inviteCode, userId) {
    try {
      // Find team by invite code
      const { data: team, error: teamError } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('invite_code', inviteCode)
        .single();

      if (teamError || !team) {
        throw new Error('Invalid invite code');
      }

      // Check if user is already a member
      const existingMember = await this.getMember(team.id, userId);
      if (existingMember) {
        throw new Error('User is already a member of this team');
      }

      // Add user as member
      await this.addMember(team.id, userId, 'member');

      return team;
    } catch (error) {
      throw error;
    }
  }

  async createTeamGoal(teamId, createdByUserId, goalData) {
    try {
      // Verify user is team member
      const member = await this.getMember(teamId, createdByUserId);
      if (!member) {
        throw new Error('User is not a member of this team');
      }

      const { data, error } = await this.supabase
        .from('team_goals')
        .insert([{
          team_id: teamId,
          created_by_user_id: createdByUserId,
          title: goalData.title,
          description: goalData.description,
          type: goalData.type, // 'macro' or 'micro'
          target_completion_date: goalData.target_completion_date,
          status: 'active',
          progress_percentage: 0,
          assigned_to_user_id: goalData.assigned_to_user_id || null
        }])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async getTeamGoals(teamId, type = null) {
    try {
      let query = this.supabase
        .from('team_goals')
        .select(`
          *,
          created_by_user:users!team_goals_created_by_user_id_fkey(id, display_name),
          assigned_user:users!team_goals_assigned_to_user_id_fkey(id, display_name)
        `)
        .eq('team_id', teamId);

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async updateTeamGoalProgress(goalId, progress, updatedByUserId) {
    try {
      const updateData = { progress_percentage: progress };

      if (progress >= 100) {
        updateData.status = 'completed';
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await this.supabase
        .from('team_goals')
        .update(updateData)
        .eq('id', goalId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async getTeamProgress(teamId) {
    try {
      const macroGoals = await this.getTeamGoals(teamId, 'macro');
      const microGoals = await this.getTeamGoals(teamId, 'micro');

      const macroProgress = macroGoals.length > 0
        ? macroGoals.reduce((sum, goal) => sum + (goal.progress_percentage || 0), 0) / macroGoals.length
        : 0;

      const completedMicroGoals = microGoals.filter(g => g.status === 'completed').length;
      const microCompletionRate = microGoals.length > 0
        ? (completedMicroGoals / microGoals.length) * 100
        : 0;

      return {
        macroGoals: {
          total: macroGoals.length,
          averageProgress: Math.round(macroProgress * 100) / 100,
          completed: macroGoals.filter(g => g.status === 'completed').length
        },
        microGoals: {
          total: microGoals.length,
          completed: completedMicroGoals,
          completionRate: Math.round(microCompletionRate * 100) / 100
        }
      };
    } catch (error) {
      throw error;
    }
  }

  generateInviteCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  async regenerateInviteCode(teamId, userId) {
    try {
      // Verify user is admin
      const member = await this.getMember(teamId, userId);
      if (!member || member.role !== 'admin') {
        throw new Error('Only team admins can regenerate invite codes');
      }

      const newInviteCode = this.generateInviteCode();

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({ invite_code: newInviteCode })
        .eq('id', teamId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return { ...data, invite_code: newInviteCode };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = TeamRepository;