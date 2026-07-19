// ---------------------------------------------------------
  // Weather data: Open-Meteo Forecast API (no key required)
  //   GET https://api.open-meteo.com/v1/forecast
  //       ?latitude=..&longitude=..
  //       &current=temperature_2m,relative_humidity_2m,apparent_temperature,
  //                weather_code,wind_speed_10m,is_day
  //       &hourly=temperature_2m,weather_code
  //       &daily=weather_code,temperature_2m_max,temperature_2m_min,
  //              sunrise,sunset
  //       &timezone=auto
  //
  // City search: Open-Meteo Geocoding API (also no key)
  //   GET https://geocoding-api.open-meteo.com/v1/search?name=<query>
  //
  // The page background is a gradient that shifts to match the
  // current condition (sunny, overcast, rain, snow, storm, fog,
  // clear night) — the "sky" behind the glass-panel cards.
  // ---------------------------------------------------------

  const FORECAST_API = "https://api.open-meteo.com/v1/forecast";
  const GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search";

  const searchInput = document.getElementById("searchInput");
  const suggestionsEl = document.getElementById("suggestions");
  const statusEl = document.getElementById("status");
  const dashboard = document.getElementById("dashboard");
  const unitCBtn = document.getElementById("unitC");
  const unitFBtn = document.getElementById("unitF");
  const recentList = document.getElementById("recentList");
  const recentTitle = document.getElementById("recentTitle");

  let debounceTimer = null;
  let activeSuggestion = -1;
  let unit = "celsius"; // or "fahrenheit"
  let lastLocation = null;
  let recents = [];

  function setStatus(msg, isError = false){
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("error", !!isError);
  }

  // ---- Sky gradient per condition + day/night ----------------
  function applySky(code, isDay){
    const skies = {
      clearDay:    ["#5aa9e6", "#ffd58a"],
      clearNight:  ["#0f1b3c", "#33356b"],
      cloudDay:    ["#8fb3d9", "#dbe4ea"],
      cloudNight:  ["#232946", "#4c5578"],
      overcast:    ["#7c8896", "#b7bec6"],
      fog:         ["#b7bcb4", "#e4e6df"],
      rain:        ["#33526e", "#5c7c94"],
      snow:        ["#9db6cc", "#e8f0f6"],
      storm:       ["#221c33", "#4a3f63"],
    };
    let key;
    if([95,96,99].includes(code)) key = "storm";
    else if([71,73,75].includes(code)) key = "snow";
    else if([45,48].includes(code)) key = "fog";
    else if([51,53,55,61,63,65,80,81,82].includes(code)) key = "rain";
    else if(code === 3) key = "overcast";
    else if([1,2].includes(code)) key = isDay ? "cloudDay" : "cloudNight";
    else key = isDay ? "clearDay" : "clearNight";

    const [c1, c2] = skies[key];
    document.documentElement.style.setProperty("--sky-1", c1);
    document.documentElement.style.setProperty("--sky-2", c2);

    // Light skies read better with dark ink; dark skies need light ink.
    const darkSkies = ["clearNight","cloudNight","storm"];
    const ink = darkSkies.includes(key) ? "#f3f0e8" : "#1b2020";
    const inkMuted = darkSkies.includes(key) ? "rgba(243,240,232,0.75)" : "#57606a";
    document.documentElement.style.setProperty("--ink", ink);
    document.documentElement.style.setProperty("--ink-muted", inkMuted);
    document.documentElement.style.setProperty("--card", darkSkies.includes(key) ? "rgba(30,28,45,0.55)" : "rgba(255,255,255,0.82)");
    document.documentElement.style.setProperty("--card-line", darkSkies.includes(key) ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.55)");
  }

  // ---- Weather code -> { label, icon() } -------------------
  function weatherInfo(code){
    const table = {
      0:  ["Clear sky", iconSun],
      1:  ["Mainly clear", iconSun],
      2:  ["Partly cloudy", iconCloudSun],
      3:  ["Overcast", iconCloud],
      45: ["Fog", iconFog],
      48: ["Depositing rime fog", iconFog],
      51: ["Light drizzle", iconRain],
      53: ["Drizzle", iconRain],
      55: ["Dense drizzle", iconRain],
      61: ["Slight rain", iconRain],
      63: ["Rain", iconRain],
      65: ["Heavy rain", iconRain],
      71: ["Slight snow", iconSnow],
      73: ["Snow", iconSnow],
      75: ["Heavy snow", iconSnow],
      80: ["Rain showers", iconRain],
      81: ["Rain showers", iconRain],
      82: ["Violent showers", iconRain],
      95: ["Thunderstorm", iconStorm],
      96: ["Thunderstorm, hail", iconStorm],
      99: ["Thunderstorm, hail", iconStorm],
    };
    return table[code] || ["Unknown", iconCloud];
  }

  function svgWrap(inner){
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }
  function iconSun(){ return svgWrap(`<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"/>`); }
  function iconCloudSun(){ return svgWrap(`<circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 2.8v1.6M8.5 12.6v1.6M3.6 8.5H5.2M11.8 8.5h1.6M4.9 4.9l1.1 1.1M11 4.9l-1.1 1.1"/><path d="M8 16.5a3.6 3.6 0 013.4-4.9 5 5 0 019.5 1.6A3.3 3.3 0 0120 18.5H8.6a2.6 2.6 0 01-.6-2z"/>`); }
  function iconCloud(){ return svgWrap(`<path d="M6.5 17.5a4 4 0 01.3-8 5.5 5.5 0 0110.6 1.5 3.6 3.6 0 01-.9 6.5H6.9z"/>`); }
  function iconFog(){ return svgWrap(`<path d="M4 8.5h11M4 12h16M4 15.5h11M4 19h16"/>`); }
  function iconRain(){ return svgWrap(`<path d="M6.5 12.5a4 4 0 01.3-8 5.5 5.5 0 0110.6 1.5 3.6 3.6 0 01-.9 6.5H6.9z"/><path d="M8 16.5l-1 3M12 16.5l-1 3M16 16.5l-1 3"/>`); }
  function iconSnow(){ return svgWrap(`<path d="M6.5 12.5a4 4 0 01.3-8 5.5 5.5 0 0110.6 1.5 3.6 3.6 0 01-.9 6.5H6.9z"/><path d="M9 17v4M7 19h4M14.5 17v4M12.5 19h4"/>`); }
  function iconStorm(){ return svgWrap(`<path d="M6.5 11.5a4 4 0 01.3-8 5.5 5.5 0 0110.6 1.5 3.6 3.6 0 01-.9 6.5H6.9z"/><path d="M12.5 15l-2.5 4h3l-1.5 3.5"/>`); }

  function formatTemp(value){
    if(unit === "fahrenheit"){
      return `${Math.round(value * 9/5 + 32)}°F`;
    }
    return `${Math.round(value)}°C`;
  }

  function formatTime(iso){
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatHour(iso){
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric" });
  }

  // ---- Geocoding search + suggestions ----------------------
  async function searchPlaces(query){
    const res = await fetch(`${GEOCODE_API}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`);
    if(!res.ok) throw new Error("geocode-failed");
    const data = await res.json();
    return data.results || [];
  }

  function closeSuggestions(){
    suggestionsEl.classList.remove("open");
    suggestionsEl.innerHTML = "";
    activeSuggestion = -1;
  }

  function showSuggestions(places){
    closeSuggestions();
    if(places.length === 0) return;
    places.forEach((p) => {
      const row = document.createElement("div");
      row.className = "suggestion";
      const region = [p.admin1, p.country].filter(Boolean).join(", ");
      row.innerHTML = `${p.name} <span class="place-country">— ${region}</span>`;
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        searchInput.value = p.name;
        closeSuggestions();
        loadWeatherFor(p);
      });
      suggestionsEl.appendChild(row);
    });
    suggestionsEl.classList.add("open");
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value;
    debounceTimer = setTimeout(async () => {
      if(!query.trim()){ closeSuggestions(); return; }
      try{
        const places = await searchPlaces(query);
        showSuggestions(places);
      }catch(err){
        closeSuggestions();
      }
    }, 250);
  });

  searchInput.addEventListener("keydown", (e) => {
    const items = suggestionsEl.querySelectorAll(".suggestion");
    if(e.key === "ArrowDown" && items.length){
      e.preventDefault();
      activeSuggestion = (activeSuggestion + 1) % items.length;
      items.forEach((el,i) => el.classList.toggle("active", i === activeSuggestion));
    } else if(e.key === "ArrowUp" && items.length){
      e.preventDefault();
      activeSuggestion = (activeSuggestion - 1 + items.length) % items.length;
      items.forEach((el,i) => el.classList.toggle("active", i === activeSuggestion));
    } else if(e.key === "Enter" && activeSuggestion >= 0){
      e.preventDefault();
      items[activeSuggestion].dispatchEvent(new Event("mousedown"));
    } else if(e.key === "Escape"){
      closeSuggestions();
    }
  });

  document.addEventListener("click", (e) => {
    if(!e.target.closest(".search-field")) closeSuggestions();
  });

  // ---- Fetch + render weather -------------------------------
  async function loadWeatherFor(place){
    lastLocation = place;
    dashboard.classList.remove("show");
    setStatus(`Loading weather for ${place.name}…`);

    try{
      const params = new URLSearchParams({
        latitude: place.latitude,
        longitude: place.longitude,
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
        hourly: "temperature_2m,weather_code",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
        forecast_days: "7",
        timezone: "auto"
      });
      const res = await fetch(`${FORECAST_API}?${params.toString()}`);
      if(!res.ok) throw new Error("forecast-failed");
      const data = await res.json();

      applySky(data.current.weather_code, data.current.is_day === 1);
      renderCurrent(place, data);
      renderHourly(data);
      renderForecast(data);

      dashboard.classList.add("show");
      setStatus("");
      addRecent(place);
    }catch(err){
      setStatus("Couldn't load weather data. Try again in a moment.", true);
    }
  }

  function renderCurrent(place, data){
    const c = data.current;
    const [label, icon] = weatherInfo(c.weather_code);

    document.getElementById("placeName").textContent = place.name;
    const region = [place.admin1, place.country].filter(Boolean).join(", ");
    document.getElementById("placeSub").textContent = region || "—";
    document.getElementById("tempNow").textContent = formatTemp(c.temperature_2m);
    document.getElementById("conditionLabel").textContent = label;
    document.getElementById("currentIcon").innerHTML = icon();

    document.getElementById("feelsLike").textContent = formatTemp(c.apparent_temperature);
    document.getElementById("humidity").textContent = `${c.relative_humidity_2m}%`;
    document.getElementById("wind").textContent = `${Math.round(c.wind_speed_10m)} km/h`;

    const today = data.daily;
    document.getElementById("sunTimes").textContent = `${formatTime(today.sunrise[0])} / ${formatTime(today.sunset[0])}`;
  }

  function renderHourly(data){
    const svg = document.getElementById("hourlySvg");
    const times = data.hourly.time.slice(0, 24);
    const temps = data.hourly.temperature_2m.slice(0, 24);

    const w = 760, h = 140, padX = 20, padY = 24;
    const min = Math.min(...temps), max = Math.max(...temps);
    const range = (max - min) || 1;

    const points = temps.map((t, i) => {
      const x = padX + (i / (temps.length - 1)) * (w - padX * 2);
      const y = h - padY - ((t - min) / range) * (h - padY * 2);
      return [x, y];
    });

    const pathD = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
    const inkColor = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#1b2020";
    const mutedColor = getComputedStyle(document.documentElement).getPropertyValue("--ink-muted").trim() || "#57606a";

    const hourLabels = [0, 6, 12, 18, 23].map(i => {
      const p = points[i];
      return `<text x="${p[0]}" y="${h - 4}" font-size="10" fill="${mutedColor}" text-anchor="middle" font-family="IBM Plex Mono, monospace">${formatHour(times[i])}</text>`;
    }).join("");

    const tempLabels = [0, 6, 12, 18, 23].map(i => {
      const p = points[i];
      return `<text x="${p[0]}" y="${p[1] - 8}" font-size="11" fill="${inkColor}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-weight="500">${Math.round(unit === "fahrenheit" ? temps[i]*9/5+32 : temps[i])}°</text>`;
    }).join("");

    const dots = [0, 6, 12, 18, 23].map(i => {
      const p = points[i];
      return `<circle cx="${p[0]}" cy="${p[1]}" r="2.8" fill="${inkColor}"/>`;
    }).join("");

    svg.innerHTML = `
      <path d="${pathD}" fill="none" stroke="${inkColor}" stroke-width="2" opacity="0.85"/>
      ${dots}
      ${tempLabels}
      ${hourLabels}
    `;
  }

  function renderForecast(data){
    const row = document.getElementById("forecastRow");
    row.innerHTML = "";
    const days = data.daily.time;

    days.forEach((day, i) => {
      const [label, icon] = weatherInfo(data.daily.weather_code[i]);
      const dayName = i === 0 ? "Today" : new Date(day).toLocaleDateString([], { weekday: "short" });
      const card = document.createElement("div");
      card.className = "forecast-day";
      card.title = label;
      card.innerHTML = `
        <div class="dname">${dayName}</div>
        ${icon()}
        <div class="hi">${formatTemp(data.daily.temperature_2m_max[i])}</div>
        <div class="lo">${formatTemp(data.daily.temperature_2m_min[i])}</div>
      `;
      row.appendChild(card);
    });
  }

  // ---- Unit toggle ------------------------------------------
  function setUnit(next){
    unit = next;
    unitCBtn.classList.toggle("active", unit === "celsius");
    unitFBtn.classList.toggle("active", unit === "fahrenheit");
    if(lastLocation) loadWeatherFor(lastLocation);
  }
  unitCBtn.addEventListener("click", () => setUnit("celsius"));
  unitFBtn.addEventListener("click", () => setUnit("fahrenheit"));

  // ---- Recently viewed ---------------------------------------
  function addRecent(place){
    recents = recents.filter(r => r.name !== place.name);
    recents.unshift(place);
    recents = recents.slice(0, 6);
    renderRecent();
  }

  function renderRecent(){
    if(recents.length === 0){ recentTitle.style.display = "none"; return; }
    recentTitle.style.display = "block";
    recentList.innerHTML = "";
    recents.forEach(p => {
      const chip = document.createElement("div");
      chip.className = "recent-chip";
      chip.textContent = p.name;
      chip.addEventListener("click", () => loadWeatherFor(p));
      recentList.appendChild(chip);
    });
  }

  // ---- Default: load a starting city on first visit ----------
  loadWeatherFor({ name: "Vijayawada", admin1: "Andhra Pradesh", country: "India", latitude: 16.5062, longitude: 80.6480 });