const BaseRepository = require('./BaseRepository');

class UserRepository extends BaseRepository {
  constructor() {
    super('web_users');
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
    try {
      const defaultOrganizationId = process.env.DEFAULT_ORGANIZATION_ID || '00000000-0000-0000-0000-000000000001';

      // Use admin client directly to bypass RLS policies for user creation
      const client = this.supabaseAdmin || this.supabase;

      const userRecord = {
        email: userData.email,
        full_name: userData.name || userData.display_name, // Use 'full_name' to match schema
        picture_url: userData.avatar_url, // Use 'picture_url' to match schema
        timezone: userData.timezone || 'UTC',
        email_verified: userData.email_verified || false,
        organization_id: userData.organization_id || defaultOrganizationId,
        provider: userData.oauth_provider, // Use 'provider' to match schema
        provider_id: userData.oauth_id || userData.oauth_provider_id, // Use 'provider_id' to match schema
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: user, error } = await client
        .from(this.tableName)
        .insert([userRecord])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  // REMOVED: updateProfile method - profile updates should use ProfileRepository
  // web_users table is for authentication only
  // Profile data belongs in profiles table

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
      // Map frontend settings to database columns
      const userSettingsRecord = {
        user_id: userId,
        username: settingsData.username || null,
        email: settingsData.email || null,
        phone: settingsData.phone || null,
        avatar_url: settingsData.avatar || null,
        theme: settingsData.theme || 'light',
        language: settingsData.language || 'en',
        email_notifications: settingsData.email_notifications !== undefined ? settingsData.email_notifications : true,
        push_notifications: settingsData.push_notifications !== undefined ? settingsData.push_notifications : true,
        marketing_emails: settingsData.marketing_emails !== undefined ? settingsData.marketing_emails : false,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('user_settings')
        .upsert(userSettingsRecord)
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