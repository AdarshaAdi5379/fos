/**
 * ProfileService — client-side API client for /api/profile and /api/follow.
 *
 * Reads are public (optional auth for viewer context), mutations require an access token.
 */

import { getApiUrl } from '../config';
import type { AvatarStyle, ProfileBundle } from '../types';

export type ProfileInput = {
  displayName?: string;
  avatarStyle?: AvatarStyle;
  bio?: string;
  themeColor?: string;
};

export class ProfileService {
  private accessToken: string | null;

  constructor(accessToken: string | null) {
    this.accessToken = accessToken;
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private maybeAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    return headers;
  }

  private authHeaders(): Record<string, string> {
    if (!this.accessToken) throw new Error('Missing access token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
    };
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(body.error || `HTTP ${res.status}`);
      err.code = body.code;
      err.allowed = body.allowed;
      throw err;
    }
    return body as T;
  }

  async getMe(): Promise<ProfileBundle> {
    const res = await fetch(getApiUrl('/api/profile/me'), { headers: this.authHeaders() });
    return this.handleResponse<ProfileBundle>(res);
  }

  async getProfile(id: string): Promise<ProfileBundle> {
    const res = await fetch(getApiUrl(`/api/profile/${encodeURIComponent(id)}`), {
      headers: this.maybeAuthHeaders(),
    });
    return this.handleResponse<ProfileBundle>(res);
  }

  async createProfile(input: ProfileInput): Promise<ProfileBundle> {
    const res = await fetch(getApiUrl('/api/profile'), {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(input),
    });
    return this.handleResponse<ProfileBundle>(res);
  }

  async updateProfile(input: ProfileInput): Promise<ProfileBundle> {
    const res = await fetch(getApiUrl('/api/profile'), {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(input),
    });
    return this.handleResponse<ProfileBundle>(res);
  }

  async follow(targetId: string): Promise<{ success: boolean }> {
    const res = await fetch(getApiUrl(`/api/follow/${encodeURIComponent(targetId)}`), {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({}),
    });
    return this.handleResponse(res);
  }

  async unfollow(targetId: string): Promise<{ success: boolean }> {
    const res = await fetch(getApiUrl(`/api/follow/${encodeURIComponent(targetId)}`), {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    return this.handleResponse(res);
  }
}

