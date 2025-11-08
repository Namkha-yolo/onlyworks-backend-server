const { getSupabaseClient } = require('../config/database');
const { logger } = require('../utils/logger');

class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
    this.supabase = getSupabaseClient();
  }

  async findById(id, userId = null) {
    try {
      const startTime = Date.now();
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id);

      // Add user filtering if userId is provided
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.single();

      const duration = Date.now() - startTime;
      logger.database('SELECT BY ID', this.tableName, duration, { id, userId });

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Failed to find ${this.tableName} by ID`, { error: error.message, id, userId });
      throw error;
    }
  }

  async findByUserId(userId, filters = {}) {
    try {
      const startTime = Date.now();
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      // Apply additional filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });

      const { data, error } = await query;

      const duration = Date.now() - startTime;
      logger.database('SELECT BY USER ID', this.tableName, duration, { userId, filters });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error(`Failed to find ${this.tableName} by user ID`, { error: error.message, userId, filters });
      throw error;
    }
  }

  async create(data) {
    try {
      const startTime = Date.now();
      const { data: result, error } = await this.supabase
        .from(this.tableName)
        .insert([data])
        .select()
        .single();

      const duration = Date.now() - startTime;
      logger.database('INSERT', this.tableName, duration, { data });

      if (error) {
        throw error;
      }

      return result;
    } catch (error) {
      logger.error(`Failed to create ${this.tableName}`, { error: error.message, data });
      throw error;
    }
  }

  async update(id, data, userId = null) {
    try {
      const startTime = Date.now();
      let query = this.supabase
        .from(this.tableName)
        .update(data)
        .eq('id', id);

      // Add user filtering if userId is provided
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: result, error } = await query.select().single();

      const duration = Date.now() - startTime;
      logger.database('UPDATE', this.tableName, duration, { id, data, userId });

      if (error) {
        throw error;
      }

      return result;
    } catch (error) {
      logger.error(`Failed to update ${this.tableName}`, { error: error.message, id, data, userId });
      throw error;
    }
  }

  async delete(id, userId = null) {
    try {
      const startTime = Date.now();
      let query = this.supabase
        .from(this.tableName)
        .delete()
        .eq('id', id);

      // Add user filtering if userId is provided
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { error } = await query;

      const duration = Date.now() - startTime;
      logger.database('DELETE', this.tableName, duration, { id, userId });

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete ${this.tableName}`, { error: error.message, id, userId });
      throw error;
    }
  }

  async count(userId = null, filters = {}) {
    try {
      const startTime = Date.now();
      let query = this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      // Apply additional filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });

      const { count, error } = await query;

      const duration = Date.now() - startTime;
      logger.database('COUNT', this.tableName, duration, { userId, filters });

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error) {
      logger.error(`Failed to count ${this.tableName}`, { error: error.message, userId, filters });
      throw error;
    }
  }

  async paginate(userId = null, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        orderBy = 'created_at',
        orderDirection = 'desc',
        filters = {}
      } = options;

      const startTime = Date.now();
      const offset = (page - 1) * limit;

      let query = this.supabase
        .from(this.tableName)
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });

      // Apply ordering and pagination
      query = query
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;

      const duration = Date.now() - startTime;
      logger.database('PAGINATE', this.tableName, duration, { userId, page, limit, filters });

      if (error) {
        throw error;
      }

      // Get total count for pagination metadata
      const totalCount = await this.count(userId, filters);
      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: data || [],
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      };
    } catch (error) {
      logger.error(`Failed to paginate ${this.tableName}`, { error: error.message, userId, options });
      throw error;
    }
  }
}

module.exports = BaseRepository;