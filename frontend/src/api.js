// Use an explicit VITE_API_URL when configured; otherwise use the host that served the page.
// This lets tablets and phones on the same Wi-Fi reach the backend on the development computer.
const API = (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`).replace(/\/$/, '')

export async function request(path, options = {}) {
  const token = localStorage.getItem('ck_admin_token')
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  let res
  try {
    res = await fetch(`${API}${path}`, { ...options, headers })
  } catch (error) {
    console.error(`CROSSKEYS request failed (${API}${path}):`, error)
    throw new Error(`Cannot reach the hotel server at ${API}. Check Wi-Fi and that the backend is running.`)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.message || `Request failed (${res.status})`)
  return data
}

export { API }
