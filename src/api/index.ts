import api from './client';

export type AuthResponse = { accessToken: string };
export type User = {
  id: string;
  email: string | null;
  name: string;
  phone?: string | null;
  role?: 'USER' | 'ADMIN';
  baseAcceptedAt?: string | null;
  ageConfirmedAt?: string | null;
  analyticsChoice?: 'allow' | 'skip' | null;
  analyticsAt?: string | null;
  notificationsChoice?: 'enable' | 'skip' | null;
  notificationsAt?: string | null;
  expoPushToken?: string | null;
  locationChoice?: 'allow' | 'deny' | 'skip' | null;
  locationAt?: string | null;
  safetyAcceptedAt?: string | null;
};
export type TestCentre = {
  id: string;
  name: string;
  address: string;
  postcode: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
};

export type RouteDto = {
  id: string;
  centreId: string;
  name: string;
  distanceM: number;
  durationEstS: number;
  difficulty: string;
  coordinates?: Array<{lat: number; lon: number}> | Array<[number, number]>;
  polyline?: string;
  bbox?: any;
  geojson?: any;
  gpx?: string | null;
  payload?: any;
  version: number;
  isActive: boolean;
  centre?: TestCentre;
};

export type Entitlement = {
  id: string;
  scope: 'GLOBAL' | 'CENTRE';
  centreId?: string | null;
  endsAt?: string | null;
};

export type CashbackStatus = { status: string; suspicious?: boolean };

export const apiAuth = {
  register: (email: string, password: string, name: string, phone: string | undefined, deviceId: string) =>
    api.post<{ data: AuthResponse }>('/auth/register', { email, password, name, phone, deviceId }),
  login: (email: string, password: string, deviceId: string) =>
    api.post<{ data: AuthResponse }>('/auth/login', { email, password, deviceId }),
  me: () => api.get<{ data: User }>('/me'),
  updateConsents: (payload: Partial<User>) => api.patch<{ data: User }>('/me/consents', payload),
  updatePushToken: (expoPushToken: string | null) => api.patch<{ data: User }>('/me/push-token', { expoPushToken }),
  updateMe: (data: Partial<User>) => api.patch<{ data: User }>('/me', data),
  deleteMe: () => api.delete('/me'),
};

export const apiCentres = {
  search: (params: { query?: string; near?: string; radiusKm?: number; page?: number; limit?: number }) =>
    api.get<{ data: { items: TestCentre[]; meta: any } | TestCentre[] }>('/centres', { params }),
  detail: (id: string) => api.get<{ data: TestCentre }>('/centres/' + id),
  routes: (centreId: string) => api.get<{ data: RouteDto[] }>(`/centres/${centreId}/routes`),
};

export const apiRoutes = {
  detail: (id: string) => api.get<{ data: RouteDto }>(`/routes/${id}`),
  download: (id: string) => api.get<{ data: RouteDto }>(`/routes/${id}/download`),
  startPractice: (id: string) => api.post(`/routes/${id}/practice/start`),
  finishPractice: (id: string, payload: { completed: boolean; distanceM?: number; durationS?: number }) =>
    api.post(`/routes/${id}/practice/finish`, payload),
};

export const apiEntitlements = {
  list: () => api.get<{ data: Entitlement[] }>('/entitlements'),
};

export const apiCashback = {
  status: () => api.get<{ data: any }>('/cashback/status'),
  start: () => api.post('/cashback/start'),
  submit: (payload: any) => api.post('/cashback/submit', payload),
};

export const apiRevenuecat = {
  // placeholder for server interactions if needed later
};

export const apiAdmin = {
  stats: () => api.get<{ data: { users: number } }>('/admin/stats'),
  uploadRoute: (
    centreId: string | null,
    file: { uri: string; name: string; type: string },
    meta?: { centreName?: string; postcode?: string; routeName?: string },
  ) => {
    const form = new FormData();
    if (centreId) {
      form.append('centreId', centreId);
    }
    if (meta?.centreName) form.append('centreName', meta.centreName);
    if (meta?.postcode) form.append('postcode', meta.postcode);
    if (meta?.routeName) form.append('routeName', meta.routeName);
    form.append('file', file as any);
    return api.post<{ data: any }>('/admin/routes/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
