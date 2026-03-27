/**
 * Anonymous Profile Controller
 *
 * Builds on the platform's cryptographic identity model (publicKey) and adds
 * optional, non-PII profile metadata + follow relationships.
 */

const { ProfileService } = require('../services/ProfileService');

class ProfileController {
  constructor(database) {
    this.database = database; // expects Database instance with .query()
    this.profileService = new ProfileService(database);
  }

  async initialize() {
    await this.profileService.initializeTables();
    console.log('✅ Profile controller initialized');
  }

  async getMe(req, res) {
    try {
      const publicKey = req.user.publicKey;
      const data = await this.profileService.getProfileByPublicKey(publicKey, publicKey);
      if (!data) {
        return res.status(404).json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
      }
      res.json(data);
    } catch (error) {
      console.error('Get my profile error:', error);
      res.status(500).json({ error: 'Failed to get profile', code: 'PROFILE_GET_ERROR' });
    }
  }

  async getProfile(req, res) {
    try {
      const id = (req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Profile id is required', code: 'MISSING_PROFILE_ID' });
      }

      const viewerKey = req.user?.publicKey || null;
      const data = id.startsWith('user_')
        ? await this.profileService.getProfileByAnonId(id, viewerKey)
        : await this.profileService.getProfileByPublicKey(id, viewerKey);

      if (!data) {
        return res.status(404).json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
      }

      res.json(data);
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile', code: 'PROFILE_GET_ERROR' });
    }
  }

  async createProfile(req, res) {
    try {
      const publicKey = req.user.publicKey;
      const validation = this.profileService.validateProfileInput(req.body || {}, { requireDisplayName: true });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error, code: validation.code, allowed: validation.allowed });
      }

      const created = await this.profileService.createProfile(publicKey, validation.data);
      res.status(201).json(created);
    } catch (error) {
      console.error('Create profile error:', error);
      if (error.code === 'PROFILE_EXISTS') {
        return res.status(409).json({ error: error.message, code: error.code });
      }
      if (error.message && String(error.message).toLowerCase().includes('unique')) {
        return res.status(409).json({ error: 'Display name already taken', code: 'DISPLAY_NAME_TAKEN' });
      }
      res.status(500).json({ error: 'Failed to create profile', code: 'PROFILE_CREATE_ERROR' });
    }
  }

  async updateProfile(req, res) {
    try {
      const publicKey = req.user.publicKey;
      const validation = this.profileService.validateProfileInput(req.body || {}, { requireDisplayName: false });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error, code: validation.code, allowed: validation.allowed });
      }

      const updated = await this.profileService.updateProfile(publicKey, validation.data);
      res.json(updated);
    } catch (error) {
      console.error('Update profile error:', error);
      if (error.code === 'PROFILE_NOT_FOUND') {
        return res.status(404).json({ error: error.message, code: error.code });
      }
      if (error.message && String(error.message).toLowerCase().includes('unique')) {
        return res.status(409).json({ error: 'Display name already taken', code: 'DISPLAY_NAME_TAKEN' });
      }
      res.status(500).json({ error: 'Failed to update profile', code: 'PROFILE_UPDATE_ERROR' });
    }
  }

  async follow(req, res) {
    try {
      const followerKey = req.user.publicKey;
      const targetId = (req.params.targetId || '').trim();

      if (!targetId) {
        return res.status(400).json({ error: 'Target key is required', code: 'MISSING_TARGET_KEY' });
      }

      let followingKey = targetId;
      if (targetId.startsWith('user_')) {
        const targetProfile = await this.profileService.getProfileByAnonId(targetId, followerKey);
        if (!targetProfile) {
          return res.status(404).json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
        }
        followingKey = targetProfile.profile.publicKey;
      }

      const result = await this.profileService.follow(followerKey, followingKey);
      res.status(201).json(result);
    } catch (error) {
      console.error('Follow error:', error);
      const status = error.status || 500;
      const code = error.code || 'FOLLOW_ERROR';
      res.status(status).json({ error: error.message || 'Failed to follow user', code });
    }
  }

  async unfollow(req, res) {
    try {
      const followerKey = req.user.publicKey;
      const targetId = (req.params.targetId || '').trim();

      if (!targetId) {
        return res.status(400).json({ error: 'Target key is required', code: 'MISSING_TARGET_KEY' });
      }

      let followingKey = targetId;
      if (targetId.startsWith('user_')) {
        const targetProfile = await this.profileService.getProfileByAnonId(targetId, followerKey);
        if (!targetProfile) {
          return res.status(404).json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
        }
        followingKey = targetProfile.profile.publicKey;
      }

      const result = await this.profileService.unfollow(followerKey, followingKey);
      res.json(result);
    } catch (error) {
      console.error('Unfollow error:', error);
      const status = error.status || 500;
      const code = error.code || 'UNFOLLOW_ERROR';
      res.status(status).json({ error: error.message || 'Failed to unfollow user', code });
    }
  }

  async getFollowers(req, res) {
    try {
      const id = (req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Profile id is required', code: 'MISSING_PROFILE_ID' });
      }

      const limit = req.query.limit;
      const offset = req.query.offset;

      let targetKey = id;
      if (id.startsWith('user_')) {
        const targetProfile = await this.profileService.getProfileByAnonId(id, req.user?.publicKey || null);
        if (!targetProfile) {
          return res.status(404).json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
        }
        targetKey = targetProfile.profile.publicKey;
      }

      const list = await this.profileService.listFollowers(targetKey, { limit, offset });
      res.json({ followers: list, pagination: { limit: Math.min(parseInt(limit, 10) || 20, 100), offset: Math.max(parseInt(offset, 10) || 0, 0) } });
    } catch (error) {
      console.error('Get followers error:', error);
      res.status(500).json({ error: 'Failed to get followers', code: 'FOLLOWERS_GET_ERROR' });
    }
  }

  async getFollowing(req, res) {
    try {
      const id = (req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Profile id is required', code: 'MISSING_PROFILE_ID' });
      }

      const limit = req.query.limit;
      const offset = req.query.offset;

      let targetKey = id;
      if (id.startsWith('user_')) {
        const targetProfile = await this.profileService.getProfileByAnonId(id, req.user?.publicKey || null);
        if (!targetProfile) {
          return res.status(404).json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
        }
        targetKey = targetProfile.profile.publicKey;
      }

      const list = await this.profileService.listFollowing(targetKey, { limit, offset });
      res.json({ following: list, pagination: { limit: Math.min(parseInt(limit, 10) || 20, 100), offset: Math.max(parseInt(offset, 10) || 0, 0) } });
    } catch (error) {
      console.error('Get following error:', error);
      res.status(500).json({ error: 'Failed to get following', code: 'FOLLOWING_GET_ERROR' });
    }
  }
}

module.exports = ProfileController;
