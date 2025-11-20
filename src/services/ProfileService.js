const ProfileRepository = require('../repositories/ProfileRepository');
const FileStorageService = require('./FileStorageService');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

// File size limits
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_RESUME_SIZE = 10 * 1024 * 1024; // 10MB

class ProfileService {
  constructor() {
    this.profileRepository = new ProfileRepository();
    this.avatarStorageService = new FileStorageService('avatars');
    this.resumeStorageService = new FileStorageService('resumes');
  }

  async getProfile(userId) {
    try {
      const profile = await this.profileRepository.findByUserId(userId);
      if (!profile) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'profile' });
      }
      return profile;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error getting profile', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_profile' });
    }
  }

  async updateProfile(userId, profileData) {
    try {
      const updateData = { ...profileData };

      // Validate file sizes
      if (profileData.profile_photo) {
        const base64String = profileData.profile_photo.replace(/^data:[^;]+;base64,/, '');
        const sizeInBytes = (base64String.length * 3) / 4; // Convert base64 to bytes

        if (sizeInBytes > MAX_AVATAR_SIZE) {
          throw new ApiError('VALIDATION_ERROR', {
            field: 'profile_photo',
            message: `Profile photo must be less than ${MAX_AVATAR_SIZE / 1024 / 1024}MB`,
            max_size_mb: MAX_AVATAR_SIZE / 1024 / 1024,
            actual_size_mb: Math.round((sizeInBytes / 1024 / 1024) * 100) / 100
          });
        }
      }

      if (profileData.resume) {
        const base64String = profileData.resume.replace(/^data:[^;]+;base64,/, '');
        const sizeInBytes = (base64String.length * 3) / 4;

        if (sizeInBytes > MAX_RESUME_SIZE) {
          throw new ApiError('VALIDATION_ERROR', {
            field: 'resume',
            message: `Resume must be less than ${MAX_RESUME_SIZE / 1024 / 1024}MB`,
            max_size_mb: MAX_RESUME_SIZE / 1024 / 1024,
            actual_size_mb: Math.round((sizeInBytes / 1024 / 1024) * 100) / 100
          });
        }
      }

      // Check username uniqueness if changing username
      if (profileData.username) {
        const existingProfile = await this.profileRepository.findByUserId(userId);

        // Only check if username is actually changing
        if (existingProfile && existingProfile.username !== profileData.username) {
          const usernameExists = await this.profileRepository.findByUsername(profileData.username);

          if (usernameExists) {
            throw new ApiError('RESOURCE_CONFLICT', {
              field: 'username',
              message: 'Username is already taken'
            });
          }
        }
      }

      // Prepare parallel upload tasks
      const uploadTasks = [];

      if (profileData.profile_photo) {
        uploadTasks.push({
          type: 'avatar',
          promise: this.avatarStorageService.uploadBase64File(
            profileData.profile_photo,
            userId,
            profileData.profile_photo_name || 'avatar.png',
            profileData.profile_photo_type || 'image/png'
          )
        });
        delete updateData.profile_photo;
      }

      if (profileData.resume) {
        uploadTasks.push({
          type: 'resume',
          promise: this.resumeStorageService.uploadBase64File(
            profileData.resume,
            userId,
            profileData.resume_name || 'resume.pdf',
            'application/pdf'
          )
        });
        delete updateData.resume;
      }

      // Execute uploads in parallel
      if (uploadTasks.length > 0) {
        const results = await Promise.allSettled(
          uploadTasks.map(task => task.promise)
        );

        // Track successful uploads for potential rollback
        const successfulUploads = [];

        // Process results
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const task = uploadTasks[i];

          if (result.status === 'fulfilled' && result.value.success) {
            // Upload succeeded
            if (task.type === 'avatar') {
              updateData.avatar_url = result.value.data.publicUrl;
              successfulUploads.push({ bucket: 'avatars', path: result.value.data.path });
            } else if (task.type === 'resume') {
              updateData.resume_url = result.value.data.publicUrl;
              successfulUploads.push({ bucket: 'resumes', path: result.value.data.path });
            }
          } else {
            // Upload failed - rollback successful uploads
            const errorDetails = result.status === 'fulfilled' ? result.value.error : result.reason;
            logger.error(`Failed to upload ${task.type}`, {
              userId,
              error: errorDetails
            });

            // Clean up successful uploads
            for (const upload of successfulUploads) {
              try {
                const storageService = new FileStorageService(upload.bucket);
                await storageService.deleteFile(upload.path);
                logger.info('Rolled back successful upload', { bucket: upload.bucket, path: upload.path });
              } catch (cleanupError) {
                logger.error('Failed to rollback upload', {
                  bucket: upload.bucket,
                  path: upload.path,
                  error: cleanupError.message
                });
              }
            }

            throw new ApiError('FILE_UPLOAD_FAILED', {
              message: `Failed to upload ${task.type}`,
              details: errorDetails
            });
          }
        }
      }

      // Set profile_complete to true when profile is being updated
      if (profileData.full_name || profileData.username || profileData.field_of_work) {
        updateData.profile_complete = true;
      }

      // Update profile in database
      const updatedProfile = await this.profileRepository.updateProfile(userId, updateData);

      logger.business('profile_updated', {
        user_id: userId,
        updated_fields: Object.keys(updateData),
        profile_complete: updatedProfile.profile_complete
      });

      return updatedProfile;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error updating profile', { error: error.message, userId, profileData });
      throw new ApiError('INTERNAL_ERROR', { operation: 'update_profile' });
    }
  }

  async createProfile(userId, profileData) {
    try {
      // Check if profile already exists
      const existingProfile = await this.profileRepository.findByUserId(userId);
      if (existingProfile) {
        throw new ApiError('RESOURCE_CONFLICT', {
          field: 'profile',
          message: 'Profile already exists for this user'
        });
      }

      // Check username uniqueness
      if (profileData.username) {
        const existingUsername = await this.profileRepository.findByUsername(profileData.username);
        if (existingUsername) {
          throw new ApiError('RESOURCE_CONFLICT', {
            field: 'username',
            message: 'Username already taken'
          });
        }
      }

      const profile = await this.profileRepository.createProfile(userId, profileData);

      logger.business('profile_created', {
        user_id: userId,
        username: profile.username
      });

      return profile;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error creating profile', { error: error.message, userId, profileData });
      throw new ApiError('INTERNAL_ERROR', { operation: 'create_profile' });
    }
  }
}

module.exports = ProfileService;
