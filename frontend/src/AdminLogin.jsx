import React, {useState} from 'react'
import {useNavigate, Link} from 'react-router-dom'
import {request} from './api'
export default function AdminLogin(){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false); const nav=useNavigate()
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{const r=await request('/api/admin/login',{method:'POST',body:JSON.stringify({username,password})});localStorage.setItem('ck_admin_token',r.access_token);nav('/admin')}catch(err){setError(err.message)}finally{setBusy(false)}}
 return <main className="admin-login"><Link className="back-link" to="/">← Back to website</Link><div className="login-card"><img className="login-logo" src="/crosskeys-logo.jpeg" alt="CROSSKEYS Hotel logo"/><p className="eyebrow">CROSSKEYS MANAGEMENT</p><h1>Admin sign in</h1><p className="muted">Sign in to manage slideshow, room and gallery photos.</p><form onSubmit={submit}><label>Admin username<input type="text" autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="button navy submit" disabled={busy}>{busy?'Signing in…':'Sign in →'}</button>{error&&<p className="notice">{error}</p>}</form><small>Credentials are configured in backend/.env.</small></div></main>
}
