const BaseRepository = require('./BaseRepository');

class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  async findByEmail(email) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('email', email)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async createUser(userData) {
    const defaultOrganizationId = process.env.DEFAULT_ORGANIZATION_ID || '00000000-0000-0000-0000-000000000001';

    const user = await this.create({
      email: userData.email,
      name: userData.name || userData.display_name, // Use 'name' instead of 'display_name'
      avatar_url: userData.avatar_url,
      timezone: userData.timezone || 'UTC',
      email_verified: userData.email_verified || false,
      organization_id: userData.organization_id || defaultOrganizationId,
      oauth_provider: userData.oauth_provider,
      oauth_id: userData.oauth_id || userData.oauth_provider_id, // Use 'oauth_id' instead of 'oauth_provider_id'
      status: 'active'
    });

    return user;
  }

  async updateProfile(userId, profileData) {
    const allowedFields = ['display_name', 'avatar_url', 'timezone'];
    const updateData = {};

    allowedFields.forEach(field => {
      if (profileData[field] !== undefined) {
        updateData[field] = profileData[field];
      }
    });

    return this.update(userId, updateData);
  }

  async updateStatus(userId, status) {
    return this.update(userId, { status });
  }

  async getUserSettings(userId) {
    try {
      const { data, error } = await this.supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async updateUserSettings(userId, settingsData) {
    try {
      const { data, error } = await this.supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          settings: settingsData,
          updated_at: new Date().toISOString()
        })
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
}

module.exports = UserRepository;