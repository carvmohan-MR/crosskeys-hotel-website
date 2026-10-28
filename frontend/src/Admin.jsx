import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API, request } from './api'

const sections = [
  { id: 'slideshow', label: 'Slideshow' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'gallery', label: 'Gallery' },
]

const imageUrl = (path) => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${API.replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`
}

export default function Admin() {
  const [section, setSection] = useState('slideshow')
  const [rooms, setRooms] = useState([])
  const [slides, setSlides] = useState([])
  const [gallery, setGallery] = useState([])
  const [slideFiles, setSlideFiles] = useState([])
  const [galleryFiles, setGalleryFiles] = useState([])
  const [roomFiles, setRoomFiles] = useState({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    const errors = []
    const handleError = (error, sectionName) => {
      errors.push(`${sectionName}: ${error.message || 'Unable to load.'}`)
      if (/401|403|token|unauthor/i.test(error.message || '')) {
        localStorage.removeItem('ck_admin_token')
        navigate('/admin/login')
      }
    }
    // Load sections independently: a missing Gallery endpoint on an older backend
    // must not prevent the Rooms and Slideshow managers from rendering.
    const [roomResult, slideResult, galleryResult] = await Promise.allSettled([
      request('/api/rooms'),
      request('/api/admin/slideshow'),
      request('/api/admin/gallery'),
    ])
    if (roomResult.status === 'fulfilled') setRooms(Array.isArray(roomResult.value) ? roomResult.value : [])
    else handleError(roomResult.reason, 'Rooms')
    if (slideResult.status === 'fulfilled') setSlides(Array.isArray(slideResult.value?.images) ? slideResult.value.images : [])
    else handleError(slideResult.reason, 'Slideshow')
    if (galleryResult.status === 'fulfilled') setGallery(Array.isArray(galleryResult.value?.images) ? galleryResult.value.images : [])
    else handleError(galleryResult.reason, 'Gallery')
    setMessage(errors.length ? errors.join(' · ') : '')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function uploadFiles(endpoint, files, clear) {
    if (!files?.length) {
      setMessage('Choose one or more images first.')
      return
    }
    const selectedFiles = Array.from(files)
    const maxImageBytes = 20 * 1024 * 1024
    const tooLarge = selectedFiles.find(file => file.size > maxImageBytes)
    const emptyFile = selectedFiles.find(file => file.size === 0)
    if (tooLarge) {
      setMessage(`\"${tooLarge.name}\" is larger than 20 MB. Please choose a smaller image.`)
      return
    }
    if (emptyFile) {
      setMessage(`\"${emptyFile.name}\" is empty. Please choose another image.`)
      return
    }
    const form = new FormData()
    selectedFiles.forEach(file => form.append('files', file))
    try {
      const result = await request(endpoint, { method: 'POST', body: form })
      setMessage(result.message || 'Images uploaded.')
      clear()
      await load()
    } catch (error) {
      setMessage(error.message || 'Image upload failed.')
    }
  }

  async function removeImage(endpoint, label) {
    if (!window.confirm(`Remove this ${label} image?`)) return
    try {
      const result = await request(endpoint, { method: 'DELETE' })
      setMessage(result.message || 'Image removed.')
      await load()
    } catch (error) {
      setMessage(error.message || 'Unable to remove image.')
    }
  }

  async function setActive(image, target, active) {
    try {
      await request(`/api/admin/${target}/images/${image.id}`, {
        method: 'PATCH', body: JSON.stringify({ active }),
      })
      setMessage(active ? 'Image is visible on the website.' : 'Image hidden from the website.')
      await load()
    } catch (error) {
      setMessage(error.message || 'Unable to update image.')
    }
  }

  async function setRoomPhotoFiles(room) {
    const files = roomFiles[room.id]
    if (!files?.length) {
      setMessage(`Choose photos for ${room.name} first.`)
      return
    }
    await uploadFiles(`/api/admin/rooms/${room.id}/images`, files, () => setRoomFiles(old => ({ ...old, [room.id]: null })))
  }

  async function removeRoomPhoto(room, index) {
    if (!window.confirm(`Remove this photo from ${room.name}?`)) return
    try {
      await request(`/api/admin/rooms/${room.id}/images/${index}`, { method: 'DELETE' })
      setMessage(`${room.name} photo removed.`)
      await load()
    } catch (error) {
      setMessage(error.message || 'Unable to remove room photo.')
    }
  }

  const currentTitle = sections.find(item => item.id === section)?.label || 'Slideshow'

  return (
    <div className="admin-page">
      <header className="admin-nav">
        <Link className="brand" to="/"><img className="brand-logo" src="/crosskeys-logo.jpeg" alt="CROSSKEYS Hotel logo"/><span>CROSSKEYS<small>IMAGE MANAGER</small></span></Link>
        <div><Link to="/">View website</Link><button onClick={() => { localStorage.removeItem('ck_admin_token'); navigate('/admin/login') }} className="text-button">Sign out</button></div>
      </header>
      <main className="admin-content">
        <div className="admin-heading"><div><p className="eyebrow">CROSSKEYS HOTEL</p><h1>Photo Manager</h1><p>Add or remove photos from each website section.</p></div><span className="status-pill">● Admin access</span></div>
        <div className="media-tabs" role="tablist" aria-label="Photo sections">
          {sections.map(item => <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={`media-tab ${section === item.id ? 'active' : ''}`} onClick={() => { setSection(item.id); setMessage('') }}>{item.label}</button>)}
        </div>
        {message && <p className="notice" role="status">{message}</p>}
        {loading ? <p className="muted">Loading photos…</p> : <>
          {section === 'slideshow' && <section className="admin-panel media-panel">
            <div className="panel-heading"><div><p className="eyebrow">HOMEPAGE</p><h2>Slideshow photos</h2><p className="muted">These photos appear in the large homepage slideshow.</p></div></div>
            <label className="slideshow-upload">Choose slideshow photos<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => setSlideFiles(e.target.files)} /></label>
            <button className="button navy" type="button" onClick={() => uploadFiles('/api/admin/slideshow/images', slideFiles, () => setSlideFiles([]))}>Add to slideshow</button>
            <div className="slideshow-admin-grid media-image-grid">{slides.map((image, index) => <article className="slideshow-admin-card" key={image.id}><img src={imageUrl(image.image_url)} alt={`Slideshow Image ${index + 1}`}/><div className="slideshow-admin-details"><h3 className="image-number">Image {index + 1}</h3><label className="check-label"><input type="checkbox" checked={image.active} onChange={e => setActive(image, 'slideshow', e.target.checked)} /> Show on website</label><button className="danger-button" type="button" onClick={() => removeImage(`/api/admin/slideshow/images/${image.id}`, 'slideshow')}>Delete Image {index + 1}</button></div></article>)}</div>
            {!slides.length && <p className="muted">No slideshow photos added yet.</p>}
          </section>}

          {section === 'rooms' && <section className="admin-panel media-panel">
            <div className="panel-heading"><div><p className="eyebrow">ROOM PHOTOS</p><h2>Room photos</h2><p className="muted">Choose a room below to add or remove photos for that room only.</p></div></div>
            <div className="admin-room-grid">{rooms.map(room => <article className="admin-room media-room" key={room.id}>
              <div><h3>{room.name}</h3></div>
              <label className="upload-label">Choose photos for {room.name}<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => setRoomFiles(old => ({ ...old, [room.id]: e.target.files }))} /></label>
              <button className="button navy" type="button" onClick={() => setRoomPhotoFiles(room)}>Add room photos</button>
              <div className="admin-photo-gallery">{(room.image_urls || []).map((url, index) => <div className="admin-photo-item" key={`${url}-${index}`}><img src={imageUrl(url)} alt={`${room.name} Image ${index + 1}`} /><strong className="image-number">Image {index + 1}</strong><button type="button" className="danger-button" onClick={() => removeRoomPhoto(room, index)}>Delete Image {index + 1}</button></div>)}</div>
              {!(room.image_urls || []).length && <p className="muted">No photos added for this room.</p>}
            </article>)}</div>
          </section>}

          {section === 'gallery' && <section className="admin-panel media-panel">
            <div className="panel-heading"><div><p className="eyebrow">WEBSITE GALLERY</p><h2>Gallery photos</h2><p className="muted">These photos appear only in the Gallery section of the website.</p></div></div>
            <label className="slideshow-upload">Choose gallery photos<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => setGalleryFiles(e.target.files)} /></label>
            <button className="button navy" type="button" onClick={() => uploadFiles('/api/admin/gallery/images', galleryFiles, () => setGalleryFiles([]))}>Add to gallery</button>
            <div className="slideshow-admin-grid media-image-grid">{gallery.map((image, index) => <article className="slideshow-admin-card" key={image.id}><img src={imageUrl(image.image_url)} alt={`Gallery Image ${index + 1}`}/><div className="slideshow-admin-details"><h3 className="image-number">Image {index + 1}</h3><label className="check-label"><input type="checkbox" checked={image.active} onChange={e => setActive(image, 'gallery', e.target.checked)} /> Show on website</label><button className="danger-button" type="button" onClick={() => removeImage(`/api/admin/gallery/images/${image.id}`, 'gallery')}>Delete Image {index + 1}</button></div></article>)}</div>
            {!gallery.length && <p className="muted">No gallery photos added yet.</p>}
          </section>}
        </>}
      </main>
    </div>
  )
}
