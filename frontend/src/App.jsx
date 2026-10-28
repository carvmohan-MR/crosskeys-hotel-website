import React, { useEffect, useRef, useState } from 'react'
import { API, request } from './api'

const WHATSAPP_NUMBER = '919952367870' // CROSSKEYS primary contact number, international format without +
const whatsappLink = (message) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`

export default function App() {
  const [rooms, setRooms] = useState([])
  const [slides, setSlides] = useState([])
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideInterval, setSlideInterval] = useState(10)
  const [roomPhotoIndices, setRoomPhotoIndices] = useState({})
  const [enquiry, setEnquiry] = useState({ check_in: '', check_out: '', guests: '' })
  const [galleryImages, setGalleryImages] = useState([])
  const galleryTrackRef = useRef(null)
  const [notice, setNotice] = useState('')

  // ALET-inspired horizontal gallery: pointer dragging, wheel-to-horizontal,
  // and a short inertial glide with gentle resistance at either end.
  useEffect(() => {
    const el = galleryTrackRef.current
    if (!el) return
    let pointerId = null
    let startX = 0
    let startScroll = 0
    let lastX = 0
    let lastTime = 0
    let velocity = 0
    let frame = 0
    let dragged = false

    const stopGlide = () => { if (frame) cancelAnimationFrame(frame); frame = 0 }
    const glide = () => {
      if (Math.abs(velocity) < 0.25) { frame = 0; return }
      const max = Math.max(0, el.scrollWidth - el.clientWidth)
      const next = el.scrollLeft + velocity
      if (next < 0 || next > max) velocity *= 0.72
      el.scrollLeft = Math.max(0, Math.min(max, next))
      velocity *= 0.94
      frame = requestAnimationFrame(glide)
    }
    const onPointerDown = e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      stopGlide()
      pointerId = e.pointerId
      startX = lastX = e.clientX
      startScroll = el.scrollLeft
      lastTime = performance.now()
      velocity = 0
      dragged = false
      el.classList.add('is-dragging')
      el.setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = e => {
      if (pointerId !== e.pointerId) return
      const dx = e.clientX - startX
      if (Math.abs(dx) > 4) dragged = true
      if (dragged) {
        e.preventDefault()
        el.scrollLeft = startScroll - dx
        const now = performance.now()
        const dt = Math.max(1, now - lastTime)
        velocity = -(e.clientX - lastX) * 16 / dt
        lastX = e.clientX
        lastTime = now
      }
    }
    const onPointerUp = e => {
      if (pointerId !== e.pointerId) return
      pointerId = null
      el.classList.remove('is-dragging')
      if (Math.abs(velocity) > 0.5) frame = requestAnimationFrame(glide)
    }
    const onWheel = e => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault()
        el.scrollBy({ left: e.deltaY, behavior: 'auto' })
      }
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      stopGlide()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [galleryImages.length])

  useEffect(() => {
    let cancelled = false

    request('/api/rooms')
      .then(data => {
        if (cancelled) return
        // The current API returns an array directly; also tolerate wrapped responses.
        const roomList = Array.isArray(data) ? data : (Array.isArray(data?.rooms) ? data.rooms : [])
        setRooms(roomList.map(room => ({
          ...room,
          image_urls: Array.isArray(room.image_urls)
            ? room.image_urls
            : (Array.isArray(room.images) ? room.images.map(image => typeof image === 'string' ? image : image.image_url || image.url).filter(Boolean) : [])
        })))
        setNotice(roomList.length ? '' : 'Room details are being updated. Please contact us on WhatsApp.')
      })
      .catch(error => {
        console.error('CROSSKEYS rooms API error:', error)
        if (!cancelled) setNotice('Room information is temporarily unavailable. Please contact us on WhatsApp.')
      })

    request('/api/slideshow')
      .then(data => {
        if (cancelled) return
        const images = Array.isArray(data?.images) ? data.images : []
        setSlides(images)
        setSlideInterval(Number(data?.interval_seconds) > 0 ? Number(data.interval_seconds) : 10)
      })
      .catch(error => console.error('CROSSKEYS slideshow API error:', error))

    request('/api/gallery').then(data => { if (!cancelled) setGalleryImages(Array.isArray(data?.images) ? data.images : []) }).catch(error => console.error('CROSSKEYS gallery API error:', error))

    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (slides.length < 2) return
    const timer = setInterval(() => setSlideIndex(i => (i + 1) % slides.length), slideInterval * 1000)
    return () => clearInterval(timer)
  }, [slides.length, slideInterval])
  useEffect(() => { if (slideIndex >= slides.length) setSlideIndex(0) }, [slides.length, slideIndex])

  const enquiryMessage = (roomName = '') => {
    const lines = [
      'Hello CROSSKEYS Hotel, I would like to enquire about a stay.',
      roomName ? `Room type: ${roomName}` : '',
      enquiry.check_in ? `Check-in: ${enquiry.check_in}` : '',
      enquiry.check_out ? `Check-out: ${enquiry.check_out}` : '',
      enquiry.guests ? `Number of guests: ${enquiry.guests}` : '',
      'Please share availability and details. Thank you.'
    ].filter(Boolean)
    return lines.join('\n')
  }

  const imageUrl = (path) => {
    if (!path) return ''
    if (/^https?:\/\//i.test(path)) return path
    return `${API.replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`
  }

  const defaultHeroImages = [
    'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=2000&q=85'
  ]
  // Keep the hero visible even if the admin API returns a slightly different image field
  // or an uploaded file URL fails to load. The fallback is applied per image.
  const heroImages = slides.length
    ? slides.map((image, index) => ({
        key: image.id ?? `admin-slide-${index}`,
        url: imageUrl(image.image_url || image.url || image.path || image.file_path) || defaultHeroImages[index % defaultHeroImages.length],
        fallback: defaultHeroImages[index % defaultHeroImages.length]
      }))
    : defaultHeroImages.map((url, index) => ({ key: `default-${index + 1}`, url, fallback: url }))

  // Each gallery arrow advances exactly two photo cards, not the full viewport.
  const scrollGalleryByTwo = (direction) => {
    const track = galleryTrackRef.current
    if (!track) return
    const tile = track.querySelector('.gallery-tile')
    if (!tile) return
    const styles = window.getComputedStyle(track)
    const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0
    const step = (tile.getBoundingClientRect().width + gap) * 2
    track.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  return <div className="site-shell">
    <header className="nav">
      <a className="brand" href="#top"><img className="brand-logo" src="/crosskeys-logo.jpeg" alt="CROSSKEYS Hotel logo"/><span>CROSSKEYS<small>THE HOTEL · PREMIUM STAY</small></span></a>
      <nav><a href="#top">Home</a><a href="#about">About</a><a href="#rooms">Rooms</a><a href="#gallery">Gallery</a><a href="#nearby">Nearby</a><a href="#location">Contact</a></nav>
    </header>
    <main id="top">
      <section className="hero">
        <div className="hero-slideshow" aria-hidden="true"><div className="hero-slide-track" style={{ transform: `translateX(-${slideIndex * 100}%)` }}>
          {heroImages.map(image => <div className="hero-slide" key={image.key}>
            <img
              className="hero-slide-image"
              src={image.url}
              alt=""
              onError={event => {
                const element = event.currentTarget
                if (element.dataset.fallbackApplied !== 'true' && image.fallback && element.src !== image.fallback) {
                  element.dataset.fallbackApplied = 'true'
                  element.src = image.fallback
                } else if (element.dataset.fallbackApplied !== 'true' && image.fallback) {
                  element.dataset.fallbackApplied = 'true'
                  element.src = image.fallback
                }
              }}
            />
          </div>)}
        </div></div>
        <div className="hero-overlay" aria-hidden="true" />
        <div className="hero-copy"><p className="eyebrow">YOUR COMFORT, OUR PRIORITY</p><h1>A stay that feels<br/>like coming home.</h1><p>A welcoming stay in Puducherry, with comfortable rooms, thoughtful details and warm hospitality.</p><a className="button light" href="#rooms">Explore our rooms <span>↗</span></a></div>
        <div className="hero-tag"><span>✦</span> PREMIUM STAY</div>
      </section>

      <section className="enquiry-panel" aria-label="Stay enquiry">
        <div><label htmlFor="enquiry-check-in">Check-in (optional)</label><input id="enquiry-check-in" type="date" value={enquiry.check_in} min={new Date().toISOString().slice(0, 10)} onChange={e => setEnquiry({ ...enquiry, check_in: e.target.value })}/></div>
        <div><label htmlFor="enquiry-check-out">Check-out (optional)</label><input id="enquiry-check-out" type="date" value={enquiry.check_out} min={enquiry.check_in || new Date().toISOString().slice(0, 10)} onChange={e => setEnquiry({ ...enquiry, check_out: e.target.value })}/></div>
        <div><label htmlFor="enquiry-guests">Number of guests (optional)</label><input id="enquiry-guests" type="number" min="1" step="1" inputMode="numeric" placeholder="Enter guests" value={enquiry.guests} onChange={e => setEnquiry({ ...enquiry, guests: e.target.value })}/></div>
        <a className="button navy" target="_blank" rel="noreferrer" href={whatsappLink(enquiryMessage())}>Enquire on WhatsApp <span>↗</span></a>
      </section>

      <section className="about-section" id="about">
        <div className="about-copy"><p className="eyebrow">WELCOME TO CROSSKEYS</p><h2>A comfortable stay, thoughtfully made.</h2><p>CROSSKEYS Hotel offers a welcoming place to relax while you explore Puducherry. Discover our Deluxe and Suite rooms, browse the photos, and contact our team directly for availability and room details.</p><a className="text-link" href="#contact">Plan your stay with us ↗</a></div>
        <div className="amenities-grid" aria-label="Stay highlights"><div><span>✦</span><h3>Comfortable rooms</h3><p>Spaces designed for a restful stay.</p></div><div><span>⌖</span><h3>Convenient location</h3><p>Easy access to Puducherry attractions.</p></div><div><span>♡</span><h3>Warm hospitality</h3><p>Friendly help for your stay enquiries.</p></div><div><span>◷</span><h3>Direct enquiries</h3><p>Message us on WhatsApp for details.</p></div></div>
      </section>

      <section className="section" id="rooms">
        <div className="section-heading"><div><p className="eyebrow">STAY YOUR WAY</p><h2>Find your perfect room</h2></div><p>Explore our room types.<br/>Message us for availability and details.</p></div>
        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="room-grid">{rooms.map((room, i) => <article className="room-card" key={room.id}>
          <div className={`room-photo room-photo-${i % 2}`} style={room.image_urls?.length ? { backgroundImage: `url("${imageUrl(room.image_urls[(roomPhotoIndices[room.id] || 0) % room.image_urls.length])}")` } : {}}>
            {room.image_urls?.length > 1 && <><button type="button" className="room-photo-arrow prev" aria-label={`Previous ${room.name} photo`} onClick={() => setRoomPhotoIndices(old => ({ ...old, [room.id]: ((old[room.id] || 0) - 1 + room.image_urls.length) % room.image_urls.length }))}>‹</button><button type="button" className="room-photo-arrow next" aria-label={`Next ${room.name} photo`} onClick={() => setRoomPhotoIndices(old => ({ ...old, [room.id]: ((old[room.id] || 0) + 1) % room.image_urls.length }))}>›</button><span className="room-photo-count">{((roomPhotoIndices[room.id] || 0) % room.image_urls.length) + 1} / {room.image_urls.length}</span></>}
          </div>
          <div className="room-content"><div className="room-title"><h3>{room.name}</h3></div><div className="room-bottom"><span>✦ Comfortable · Clean · Convenient</span><a className="button navy" target="_blank" rel="noreferrer" href={whatsappLink(enquiryMessage(room.name))}>Enquire about this room <span>↗</span></a></div></div>
        </article>)}</div>
      </section>

      <section className="gallery-section" id="gallery">
        <div className="section-heading"><div><p className="eyebrow">A GLIMPSE OF YOUR STAY</p><h2>Explore CROSSKEYS</h2></div><p>Browse room photos and contact us<br/>for more information.</p></div>
        <div className="gallery-carousel">
          {galleryImages.length > 1 && <button type="button" className="gallery-arrow gallery-arrow-prev" aria-label="Previous gallery photos" onClick={() => scrollGalleryByTwo(-1)}>‹</button>}
          <div className="gallery-grid" ref={galleryTrackRef} aria-label="Hotel photo gallery">
            {galleryImages.map((photo, index) => <div className="gallery-tile" key={photo.id} role="img" aria-label={`CROSSKEYS gallery photo ${index + 1}`} style={{backgroundImage:`url("${imageUrl(photo.image_url)}")`}} />)}
            {!galleryImages.length && <div className="gallery-empty">Gallery photos will appear here.</div>}
          </div>
          {galleryImages.length > 1 && <button type="button" className="gallery-arrow gallery-arrow-next" aria-label="Next gallery photos" onClick={() => scrollGalleryByTwo(1)}>›</button>}
        </div>
      </section>

      <section className="location-section" id="location">
        <div className="location-map"><iframe title="CROSSKEYS Hotel location map" src="https://maps.google.com/maps?q=HOTEL%20CROSSKEYS%20IN%20WHITE%20TOWN%2C%20No.%20109%20Netaji%20Subhash%20Chandra%20Bose%20Salai%20%28Gingee%20Salai%29%2C%20White%20Town%2C%20Puducherry%20605001&z=17&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
        <div className="location-info"><p className="eyebrow">COME FIND US</p><h2>Easy to find.<br/>Hard to leave.</h2>
          <div className="info-row"><span className="info-icon">⌖</span><div><h4>Our location</h4><p>No: 109, Gingee Salai,<br/>White Town,<br/>Puducherry - 605001.</p><a target="_blank" rel="noreferrer" href="https://maps.app.goo.gl/p5BqtowTbmES9Lh27">Get directions ↗</a><p>GPS: 11.926360525180064, 79.83128745862744</p></div></div>
          <div className="info-row" id="contact"><span className="info-icon">✆</span><div><h4>Contact CROSSKEYS</h4><p>Message us for room availability, enquiries and special requests.</p><p>Phone: <a href="tel:9952367870">9952367870</a><br/>Phone: <a href="tel:8220757870">8220757870</a></p><a className="button whatsapp-button" target="_blank" rel="noreferrer" href={whatsappLink('Hello CROSSKEYS Hotel, I would like to make an enquiry.')}>Chat with us on WhatsApp ↗</a></div></div>
        </div>
      </section>
      <section className="nearby-section" id="nearby">
        <div className="nearby-heading">
          <p className="eyebrow">NEARBY LOCATIONS</p>
          <h2>Explore What’s Around</h2>
          <p>Everything you need, just a few steps away.</p>
        </div>
        <div className="nearby-grid">
          {[
            { name: 'Promenade (Rock) Beach', type: 'BEACH', icon: '⌁', distance: 'Approx. 850 m', desc: 'Enjoy the beautiful Rock Beach and a refreshing walk by the sea.', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Beach%20Promenade%2C%20Pondicherry%2C%20India.jpg', query: 'Promenade+Beach+Puducherry' },
            { name: 'Le Petit Four Kannadi Bungalow', type: 'CAFÉ & RESTAURANT', icon: '☕', distance: 'Approx. 820 m', desc: 'Discover a charming café on Suffren Street in White Town.', image: '/nearby-images/le-petit-four.jpeg', query: 'Le+Petit+Four+Kannadi+Bungalow+Puducherry' },
            { name: 'Bharathi Park', type: 'GREEN SPACE', icon: '✿', distance: 'Approx. 600 m', desc: 'Relax among the trees at this peaceful central park.', image: '/nearby-images/bharathi-park.jpg', query: 'Bharathi+Park+Puducherry' },
            { name: 'Sri Aurobindo Ashram', type: 'SPIRITUAL LANDMARK', icon: '✧', distance: 'Approx. 1.2 km', desc: 'Visit the renowned spiritual community in the French Quarter.', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sri%20Aurobindo%20Asram%20Press%20building%2C%20Puducherry.jpg', query: 'Sri+Aurobindo+Ashram+Puducherry' },
            { name: 'Manakula Vinayagar Temple', type: 'HERITAGE SITE', icon: '⌂', distance: 'Approx. 1.1 km', desc: 'Explore the ornate architecture of this well-known temple.', image: '/nearby-images/manakula-vinayagar-temple.jpeg', query: 'Manakula+Vinayagar+Temple+Puducherry' },
            { name: 'Puducherry Museum', type: 'ART & HISTORY', icon: '▤', distance: 'White Town', desc: 'Discover regional history, sculptures and local collections.', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Chandikesvara%20statue%20at%20Pondicherry%20Museum%2011%20%28cropped%29.jpg', query: 'Puducherry+Museum' },
            { name: 'Basilica of the Sacred Heart of Jesus', type: 'ARCHITECTURE', icon: '✦', distance: 'Approx. 500 m', desc: 'Admire the church’s striking Gothic-inspired architecture.', image: '/nearby-images/sacred-heart-church-puducherry.jpg', query: 'Basilica+of+the+Sacred+Heart+of+Jesus+Puducherry' },
            { name: 'Puducherry Railway Station', type: 'TRANSPORT', icon: '↔', distance: 'Approx. 1.5 km', desc: 'Useful arrival point for guests travelling by train.', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pondicherry%20railway%20station%20in%20Pondicherry%2001.jpg', query: 'Puducherry+Railway+Station' }
          ].map(place => <article className="nearby-card" key={place.name}>
            <div className="nearby-photo"><img src={place.image} alt={place.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} /></div>
            <div className="nearby-icon">{place.icon}</div>
            <span className="nearby-type">{place.type}</span>
            <h3>{place.name}</h3>
            <span className="nearby-distance">♙ {place.distance}</span>
            <p>{place.desc}</p>
            <a href={`https://www.google.com/maps/search/?api=1&query=${place.query}`} target="_blank" rel="noreferrer">Get directions ↗</a>
          </article>)}
        </div>
        <p className="nearby-note">Distances are approximate from CROSSKEYS Hotel. Open directions for the current route.</p>
      </section>

    </main>
    <footer className="site-footer" id="footer">
      <div className="footer-main">
        <div className="footer-brand-column">
          <a className="brand footer-brand" href="#top"><img className="brand-logo" src="/crosskeys-logo.jpeg" alt="CROSSKEYS Hotel logo"/><span>CROSSKEYS<small>THE HOTEL · PREMIUM STAY</small></span></a>
          <p className="footer-tagline">A welcoming stay in the heart of White Town, Puducherry.</p>
        </div>
        <div className="footer-column">
          <h3>CONTACT</h3>
          <p><a href="tel:9952367870">+91 99523 67870</a></p>
          <p><a href="tel:8220757870">+91 82207 57870</a></p>
          <a className="footer-action" target="_blank" rel="noreferrer" href={whatsappLink('Hello CROSSKEYS Hotel, I have an enquiry.')}>MESSAGE US ON WHATSAPP ↗</a>
        </div>
        <div className="footer-column">
          <h3>VISIT US</h3>
          <p>No. 109, Netaji Subhash Chandra Bose Salai (Gingee Salai),</p>
          <p>White Town, Puducherry 605001, India</p>
          <a className="footer-action" target="_blank" rel="noreferrer" href="https://maps.app.goo.gl/p5BqtowTbmES9Lh27">GET DIRECTIONS ↗</a>
        </div>
        <div className="footer-column footer-links-column">
          <h3>EXPLORE</h3>
          <a href="#about">About the hotel</a>
          <a href="#rooms">Our room types</a>
          <a href="#gallery">Gallery</a>
          <a href="#contact">Contact</a>
          <span className="footer-follow-label">FOLLOW / CONNECT</span>
          <a className="footer-social-link" target="_blank" rel="noreferrer" href="https://www.instagram.com/crosskeys.py/">Instagram ↗</a>
          <a className="footer-social-link" target="_blank" rel="noreferrer" href={whatsappLink('Hello CROSSKEYS Hotel, I would like to connect.')}>WhatsApp ↗</a>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} CROSSKEYS HOTEL. ALL RIGHTS RESERVED.</span><a href="#top">BACK TO TOP ↑</a></div>
    </footer>
  </div>
}
