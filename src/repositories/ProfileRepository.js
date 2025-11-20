const BaseRepository = require('./BaseRepository');

class ProfileRepository extends BaseRepository {
  constructor() {
    super('profiles');
  }

  async findByUserId(userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async findByUsername(username) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('username', username)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async updateProfile(userId, profileData) {
    const allowedFields = [
      'email',
      'full_name',
      'name',
      'avatar_url',
      'username',
      'field_of_work',
      'experience_level',
      'company',
      'job_title',
      'work_goals',
      'resume_url',
      'resume_name',
      'profile_photo_name',
      'profile_photo_type',
      'profile_complete',
      'onboarding_completed',
      'subscription_type',
      'subscription_status'
    ];

    const updateData = {};

    allowedFields.forEach(field => {
      if (profileData[field] !== undefined) {
        updateData[field] = profileData[field];
      }
    });

    // Always update timestamp
    updateData.updated_at = new Date().toISOString();

    // Use UPSERT to handle cases where profile doesn't exist yet
    // Use admin client to bypass RLS policies
    try {
      const client = this.supabaseAdmin || this.supabase;

      const { data, error } = await client
        .from(this.tableName)
        .upsert({
          id: userId,
          ...updateData
        }, {
          onConflict: 'id'
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

  async createProfile(userId, profileData) {
    try {
      const profileRecord = {
        id: userId,
        email: profileData.email,
        full_name: profileData.full_name || profileData.name,
        name: profileData.name,
        avatar_url: profileData.avatar_url,
        username: profileData.username,
        field_of_work: profileData.field_of_work,
        experience_level: profileData.experience_level,
        company: profileData.company,
        job_title: profileData.job_title,
        work_goals: profileData.work_goals,
        resume_url: profileData.resume_url,
        resume_name: profileData.resume_name,
        profile_photo_name: profileData.profile_photo_name,
        profile_photo_type: profileData.profile_photo_type,
        profile_complete: profileData.profile_complete || false,
        onboarding_completed: profileData.onboarding_completed || false,
        subscription_type: profileData.subscription_type || 'trial',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: profile, error } = await this.supabase
        .from(this.tableName)
        .insert([profileRecord])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return profile;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ProfileRepository;
