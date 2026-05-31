// --- Types ---

export interface Event {
  id: string
  name: string
  date: string
  location: string
  description: string
  capacity: number
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  organizer_name: string
  organizer_email: string
  organizer_phone: string
  stream_enabled: boolean
  stream_platform: string
  ticketio_event_id: string
  ticketio_api_key?: string
  created_at: string
  updated_at: string
}

export interface Ticket {
  id: string
  event_id: string
  category: string
  price: number
  qr_code: string
  status: 'VALID' | 'SCANNED' | 'CANCELLED' | 'REFUNDED'
  holder_name: string
  holder_email: string
  scanned_at: string | null
  scanned_by: string
  source: string
  external_id?: string
  sync_pending?: boolean
  created_at: string
}

export interface TicketStats {
  total: number
  scanned: number
  valid: number
  cancelled: number
  refunded: number
  revenue: number
}

export interface Transaction {
  id: string
  event_id: string
  ticket_id: string
  amount: number
  payment_method: 'CASH' | 'CARD'
  status: 'PENDING' | 'COMPLETED' | 'REFUNDED'
  tse_signature?: string
  tse_serial?: string
  tse_timestamp?: string
  sumup_id?: string
  cashier_id: string
  sync_pending?: boolean
  created_at: string
}

export interface DailyReport {
  event_id: string
  event_name: string
  date: string
  generated_at: string
  total_revenue: number
  cash_revenue: number
  card_revenue: number
  tickets_sold: number
  tickets_scanned: number
  refunds: number
  transactions: Transaction[]
  dsfinvk_export: string
}

export interface Equipment {
  id: string
  name: string
  category: 'NETWORK' | 'AUDIO' | 'DISPLAY' | 'POWER' | 'OTHER'
  status: 'AVAILABLE' | 'IN_USE' | 'DEFECT'
  serial_number: string
  notes: string
}

export interface EventEquipment {
  id: string
  event_id: string
  equipment_id: string
  quantity: number
  checked_out: boolean
  checked_in: boolean
  condition: 'OK' | 'DAMAGED'
  name?: string
  category?: string
  serial_number?: string
  equipment_status?: string
}

export interface StaffAssignment {
  id: string
  event_id: string
  name: string
  role: 'EINLASS' | 'KASSE' | 'TECHNIKER' | 'AUFBAU'
  phone: string
  agency: string
  hourly_rate: number
  start_time: string
  end_time: string
  checked_in: boolean
  checked_out: boolean
  checkin_at?: string
  checkout_at?: string
  notes: string
}

export interface ProgramItem {
  id: string
  time: string
  title: string
  description: string
  location: string
  order: number
}

export interface EventProgram {
  id: string
  event_id: string
  event_name?: string
  qr_code: string
  items: ProgramItem[]
  updated_at: string
}

// --- Fetch helpers ---

function getToken() { return localStorage.getItem('token') }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const get  = <T>(path: string) => request<T>('GET', path)
const post = <T>(path: string, body: unknown) => request<T>('POST', path, body)
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body)
const del  = <T>(path: string) => request<T>('DELETE', path)

// --- API objects ---

export const auth = {
  login: (username: string, password: string) =>
    post<{ token: string; role: string }>('/api/auth/login', { username, password }),
}

export const events = {
  list: () => get<Event[]>('/api/events'),
  get:  (id: string) => get<Event>(`/api/events/${id}`),
  create: (data: Partial<Event>) => post<Event>('/api/events', data),
  update: (id: string, data: Partial<Event>) => patch<Event>(`/api/events/${id}`, data),
  delete: (id: string) => del<void>(`/api/events/${id}`),
  setStatus: (id: string, status: string) => patch<{ id: string; status: string }>(`/api/events/${id}/status`, { status }),
}

export const tickets = {
  list:  (eventId: string) => get<Ticket[]>(`/api/events/${eventId}/tickets`),
  stats: (eventId: string) => get<TicketStats>(`/api/events/${eventId}/tickets/stats`),
  create: (eventId: string, data: { category?: string; price: number; holder_name: string; holder_email: string }) =>
    post<{ ticket: Ticket; qr_image: string }>(`/api/events/${eventId}/tickets`, data),
  sync:  (eventId: string) => post<{ total: number; new: number; updated: number }>(`/api/events/${eventId}/tickets/sync`, {}),
  scan:  (qr: string) => post<{ ticket: Ticket; offline_mode: boolean }>(`/api/tickets/${encodeURIComponent(qr)}/scan`, {}),
  qrUrl: (ticketId: string) => `/api/tickets/${ticketId}/qr.png`,
}

export const transactions = {
  list:   (eventId: string) => get<Transaction[]>(`/api/events/${eventId}/transactions`),
  report: (eventId: string) => get<DailyReport>(`/api/events/${eventId}/transactions/report`),
  create: (eventId: string, data: {
    ticket_id?: string
    ticket_category?: string
    ticket_price?: number
    holder_name?: string
    holder_email?: string
    amount: number
    payment_method: 'CASH' | 'CARD'
  }) => post<{ transaction: Transaction; tse?: unknown; qr_image?: string; checkout_url?: string }>(`/api/events/${eventId}/transactions`, data),
  refund: (txId: string) => post<Transaction>(`/api/transactions/${txId}/refund`, {}),
}

export const equipment = {
  listAll:          () => get<Equipment[]>('/api/equipment'),
  create:           (data: Partial<Equipment>) => post<Equipment>('/api/equipment', data),
  update:           (id: string, data: Partial<Equipment>) => patch<Equipment>(`/api/equipment/${id}`, data),
  listForEvent:     (eventId: string) => get<EventEquipment[]>(`/api/events/${eventId}/equipment`),
  assign:           (eventId: string, data: { equipment_id: string; quantity: number }) =>
    post<EventEquipment>(`/api/events/${eventId}/equipment`, data),
  updateAssignment: (eventId: string, eqId: string, data: { checked_out?: boolean; checked_in?: boolean; condition?: string }) =>
    patch<EventEquipment>(`/api/events/${eventId}/equipment/${eqId}`, data),
}

export const staff = {
  list:   (eventId: string) => get<StaffAssignment[]>(`/api/events/${eventId}/staff`),
  add:    (eventId: string, data: Partial<StaffAssignment>) => post<StaffAssignment>(`/api/events/${eventId}/staff`, data),
  update: (eventId: string, staffId: string, data: Partial<StaffAssignment>) =>
    patch<StaffAssignment>(`/api/events/${eventId}/staff/${staffId}`, data),
  remove: (eventId: string, staffId: string) => del<void>(`/api/events/${eventId}/staff/${staffId}`),
}

export const program = {
  get:    (eventId: string) => get<EventProgram>(`/api/events/${eventId}/program`),
  upsert: (eventId: string, items: ProgramItem[]) => post<EventProgram>(`/api/events/${eventId}/program`, { items }),
  qrUrl:  (eventId: string) => `/api/events/${eventId}/program/qr`,
}
