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
    const user = await this.create({
      email: userData.email,
      display_name: userData.display_name || userData.name,
      avatar_url: userData.avatar_url,
      timezone: userData.timezone || 'UTC',
      email_verified: userData.email_verified || false,
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
}

module.exports = UserRepository;