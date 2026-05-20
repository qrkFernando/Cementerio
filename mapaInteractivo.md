<!DOCTYPE html>
<html lang="es">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cementerio San Elías · 3D</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box
    }

    html,
    body {
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
      font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif
    }

    #c {
      display: block;
      width: 100%;
      height: 100%
    }

    #ui {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none
    }

    #top {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 22px 28px
    }

    .logo {
      color: #b8c4a8;
      font-size: 13px;
      letter-spacing: 5px;
      text-transform: uppercase;
      line-height: 1.6
    }

    .logo strong {
      display: block;
      font-size: 20px;
      letter-spacing: 3px;
      color: #d4cfc4;
      font-weight: normal
    }

    .hint {
      color: #4a5448;
      font-size: 11px;
      letter-spacing: 2px;
      text-align: right;
      line-height: 2
    }

    #bottom {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 22px 28px
    }

    .epitaph {
      color: #6a7860;
      font-size: 13px;
      font-style: italic;
      letter-spacing: 1px;
      max-width: 280px;
      line-height: 1.8
    }

    .controls {
      display: flex;
      gap: 8px;
      pointer-events: all
    }

    .btn {
      background: rgba(10, 14, 10, 0.7);
      border: 1px solid #2a3428;
      color: #6a7860;
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 8px 16px;
      cursor: pointer;
      font-family: inherit;
      transition: all .2s
    }

    .btn:hover {
      border-color: #5a7048;
      color: #b8c4a8
    }

    #info {
      position: absolute;
      top: 50%;
      left: 28px;
      transform: translateY(-50%);
      color: #5a6850;
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      line-height: 2.5;
      pointer-events: none
    }

    #tooltip {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -120%);
      background: rgba(8, 10, 8, 0.92);
      border: 1px solid #2a3428;
      padding: 18px 22px;
      color: #c4bfb4;
      font-size: 13px;
      display: none;
      text-align: center;
      min-width: 200px;
      pointer-events: none
    }

    #tooltip .t-name {
      font-size: 16px;
      font-style: italic;
      margin-bottom: 5px;
      color: #d4cfc4
    }

    #tooltip .t-dates {
      font-size: 11px;
      letter-spacing: 2px;
      color: #5a6850;
      margin-bottom: 10px
    }

    #tooltip .t-epi {
      font-size: 12px;
      color: #6a7860;
      font-style: italic;
      line-height: 1.7
    }
  </style>
</head>

<body>
  <canvas id="c"></canvas>
  <div id="ui">
    <div id="top">
      <div class="logo">
        <strong>Cementerio</strong>
        San Elías · 1843
      </div>
      <div class="hint">
        Arrastra · Rotar<br>
        Scroll · Zoom<br>
        Clic · Explorar
      </div>
    </div>
    <div id="info">
      Noche despejada · 9°C<br>
      Huancayo, Perú<br>
      · · ·
    </div>
    <div id="tooltip">
      <div class="t-name" id="tt-name"></div>
      <div class="t-dates" id="tt-dates"></div>
      <div class="t-epi" id="tt-epi"></div>
    </div>
    <div id="bottom">
      <div class="epitaph">"La muerte no es nada.<br>Solo pasé a la habitación de al lado."</div>
      <div class="controls">
        <button class="btn" onclick="resetCam()">↺ Reset</button>
        <button class="btn" onclick="toggleFog()">☾ Niebla</button>
      </div>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script>
    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(innerWidth, innerHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040608);
    scene.fog = new THREE.FogExp2(0x0a1008, 0.055);

    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
    camera.position.set(0, 8, 22);
    camera.lookAt(0, 0, 0);

    const gravesData = [
      { name: "Doña Esperanza Villanueva", born: 1882, died: 1961, epi: "Su bondad nunca se apagó.", x: -6, z: -3 },
      { name: "Capitán Rodrigo Quispe", born: 1888, died: 1942, epi: "Sirvió con honor.", x: -3, z: -5 },
      { name: "Prof. Ernesto Lazo", born: 1901, died: 1978, epi: "Iluminó miles de mentes.", x: 0, z: -6 },
      { name: "Dr. Augusto Herrera", born: 1868, died: 1939, epi: "Médico del pueblo.", x: 3, z: -5 },
      { name: "Sor Inmaculada Flores", born: 1877, died: 1950, epi: "Vivió para los pobres.", x: 6, z: -3 },
      { name: "María de los Ángeles", born: 1923, died: 2018, epi: "Luz eterna.", x: -7, z: 1 },
      { name: "Alcaldesa Carmen Huanca", born: 1945, died: 2020, epi: "Justicia y amor.", x: -4, z: 2 },
      { name: "Rosa Elvira Poma", born: 1955, died: 2024, epi: "Siempre en nuestros corazones.", x: 0, z: 3 },
      { name: "Julio César Tacuri", born: 1948, died: 2023, epi: "Descansa en paz.", x: 4, z: 2 },
      { name: "Ignacio de la Cruz", born: 1843, died: 1911, epi: "El primero en este suelo.", x: 7, z: 1 },
    ];

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3f38, roughness: 0.92, metalness: 0.02 });
    const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x252825, roughness: 0.95, metalness: 0.01 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x111a0e, roughness: 1, metalness: 0 });
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 1, metalness: 0 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x1e1a14, roughness: 0.98, metalness: 0 });
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x1a1814, roughness: 0.98 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2e28, roughness: 0.94 });
    const mausoleumMat = new THREE.MeshStandardMaterial({ color: 0x2e3230, roughness: 0.88, metalness: 0.05 });
    const gatePostMat = new THREE.MeshStandardMaterial({ color: 0x3a3020, roughness: 0.8, metalness: 0.3 });

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 30, 30), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Paths
    const pathV = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 30), pathMat);
    pathV.rotation.x = -Math.PI / 2; pathV.position.set(0, 0.01, 0); pathV.receiveShadow = true;
    scene.add(pathV);
    const pathH = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.5), pathMat);
    pathH.rotation.x = -Math.PI / 2; pathH.position.set(0, 0.01, -1); pathH.receiveShadow = true;
    scene.add(pathH);

    // Walls
    function makeWall(x, z, w, h, d) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
    makeWall(0, -12, 26, 1.4, 0.5); makeWall(0, 12, 26, 1.4, 0.5);
    makeWall(-13, 0, 0.5, 1.4, 24); makeWall(13, 0, 0.5, 1.4, 24);
    makeWall(-4, 12, 0.5, 2.2, 0.8); makeWall(4, 12, 0.5, 2.2, 0.8);

    // Gate posts
    function gatePost(x) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3, 0.7), gatePostMat);
      base.position.set(x, 1.5, 12); base.castShadow = true; scene.add(base);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 8), gatePostMat);
      top.position.set(x, 3.45, 12); top.castShadow = true; scene.add(top);
    }
    gatePost(-1.8); gatePost(1.8);

    // Graves
    const graveMeshes = [];
    function makeGrave(data, idx) {
      const g = new THREE.Group();
      g.userData = data;
      const style = idx % 4;

      const mound = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 2.6), dirtMat);
      mound.position.y = 0.09; mound.receiveShadow = true; g.add(mound);

      if (style === 0) {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.12), stoneMat);
        body.position.set(0, 1.15, -1.0); body.castShadow = true; g.add(body);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.12), stoneMat);
        arm.position.set(0, 1.55, -1.0); arm.castShadow = true; g.add(arm);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.18), darkStoneMat);
        base.position.set(0, 0.22, -1.0); base.castShadow = true; g.add(base);
      } else if (style === 1) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.14), stoneMat);
        slab.position.set(0, 1.0, -1.0); slab.castShadow = true; g.add(slab);
        const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 20, 1, false, 0, Math.PI), stoneMat);
        arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2;
        arch.position.set(0, 1.65, -1.0); arch.castShadow = true; g.add(arch);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.22), darkStoneMat);
        base.position.set(0, 0.22, -1.0); base.castShadow = true; g.add(base);
      } else if (style === 2) {
        const pts = [];
        pts.push(new THREE.Vector2(0.0, 0)); pts.push(new THREE.Vector2(0.28, 0));
        pts.push(new THREE.Vector2(0.22, 0.7)); pts.push(new THREE.Vector2(0.1, 1.35));
        pts.push(new THREE.Vector2(0.0, 1.6));
        const obel = new THREE.Mesh(new THREE.LatheGeometry(pts, 4), stoneMat);
        obel.rotation.y = Math.PI / 4; obel.position.set(0, 0.22, -1.0); obel.castShadow = true; g.add(obel);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.8), darkStoneMat);
        base.position.set(0, 0.13, -1.0); base.castShadow = true; g.add(base);
      } else {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.4), stoneMat);
        slab.position.set(0, 0.27, -0.6); slab.castShadow = true; g.add(slab);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.12), darkStoneMat);
        head.position.set(0, 0.77, -1.1); head.castShadow = true; g.add(head);
        const headTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 20, 1, false, 0, Math.PI), darkStoneMat);
        headTop.rotation.z = Math.PI / 2; headTop.rotation.y = Math.PI / 2;
        headTop.position.set(0, 1.22, -1.1); headTop.castShadow = true; g.add(headTop);
      }

      const tilt = (Math.random() - 0.5) * 0.07;
      g.rotation.y = (Math.random() - 0.5) * 0.15;
      g.children.forEach(c => { if (c !== mound) c.rotation.z = tilt; });
      g.position.set(data.x, 0, data.z);
      g.userData.clickable = true;
      scene.add(g);
      graveMeshes.push(g);
    }
    gravesData.forEach((d, i) => makeGrave(d, i));

    // Dead trees
    function makeDeadTree(x, z, h) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, h, 6), woodMat);
      trunk.position.set(x, h / 2, z); trunk.rotation.z = (Math.random() - 0.5) * 0.1; trunk.castShadow = true; scene.add(trunk);
      [[0.4 * h, 0.6, 1.1, -0.6], [0.55 * h, -0.5, 0.9, 0.5], [0.7 * h, 0.3, 0.7, -0.4], [0.8 * h, -0.4, 0.5, 0.6]].forEach(([by, bx, bl, bz]) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.055, bl, 5), woodMat);
        b.position.set(x + bx * 0.35, by, z + bz * 0.3); b.rotation.z = bx * 0.55; b.rotation.x = bz * 0.3; b.castShadow = true; scene.add(b);
      });
    }
    makeDeadTree(-10, -8, 5.5); makeDeadTree(10, -9, 6.2);
    makeDeadTree(-11, 3, 4.8); makeDeadTree(10, 4, 5.1);
    makeDeadTree(-8, -11, 4.2); makeDeadTree(8, -11, 4.6);

    // Mausoleum
    const mauBase = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 3.5), darkStoneMat);
    mauBase.position.set(-8.5, 0.15, -8); mauBase.castShadow = true; scene.add(mauBase);
    const mauBody = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 3), mausoleumMat);
    mauBody.position.set(-8.5, 1.4, -8); mauBody.castShadow = true; mauBody.receiveShadow = true; scene.add(mauBody);
    const mauRoof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.2, 4), stoneMat);
    mauRoof.position.set(-8.5, 3.2, -8); mauRoof.rotation.y = Math.PI / 4; mauRoof.castShadow = true; scene.add(mauRoof);
    const mauDoor = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.12), new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1 }));
    mauDoor.position.set(-8.5, 1.05, -6.44); scene.add(mauDoor);

    // Columns
    const colPts = [];
    for (let i = 0; i <= 8; i++) colPts.push(new THREE.Vector2(i < 2 || i > 6 ? 0.12 : 0.1 + (Math.abs(4 - i) * 0.005), i * 0.3));
    const colGeo = new THREE.LatheGeometry(colPts, 8);
    [-9.8, -7.2].forEach(cx => {
      const col = new THREE.Mesh(colGeo, stoneMat);
      col.position.set(cx, 0.3, -6.5); col.castShadow = true; scene.add(col);
    });

    // Moon
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 32), new THREE.MeshStandardMaterial({ color: 0xe8e0c0, emissive: 0xc8b890, emissiveIntensity: 0.4, roughness: 0.9 }));
    moon.position.set(14, 22, -30); scene.add(moon);
    const moonLight = new THREE.PointLight(0x8090a0, 1.8, 80);
    moonLight.position.set(14, 22, -30); scene.add(moonLight);

    // Lights
    scene.add(new THREE.AmbientLight(0x0a1408, 1.2));
    const dirLight = new THREE.DirectionalLight(0x6080a0, 0.9);
    dirLight.position.set(10, 18, 10); dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5; dirLight.shadow.camera.far = 60;
    dirLight.shadow.camera.left = -20; dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20; dirLight.shadow.camera.bottom = -20;
    scene.add(dirLight);

    const lanternLight1 = new THREE.PointLight(0x806040, 1.2, 8);
    lanternLight1.position.set(-2.5, 2.5, 5); scene.add(lanternLight1);
    const lanternLight2 = new THREE.PointLight(0x806040, 1.2, 8);
    lanternLight2.position.set(2.5, 2.5, 5); scene.add(lanternLight2);

    // Lanterns
    function makeLantern(x, z) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1410, metalness: 0.6, roughness: 0.4 }));
      post.position.set(x, 1.4, z); post.castShadow = true; scene.add(post);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), new THREE.MeshStandardMaterial({ color: 0xffc060, emissive: 0xffa020, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }));
      lamp.position.set(x, 2.96, z); scene.add(lamp);
    }
    makeLantern(-2.5, 5); makeLantern(2.5, 5);
    makeLantern(-2.5, -2); makeLantern(2.5, -2);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { starPos[i * 3] = (Math.random() - 0.5) * 150; starPos[i * 3 + 1] = Math.random() * 40 + 10; starPos[i * 3 + 2] = (Math.random() - 0.5) * 150; }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xe8e0d0, size: 0.12, transparent: true, opacity: 0.7 }));
    scene.add(stars);

    // Fog planes
    const fogPlanes = [];
    for (let i = 0; i < 6; i++) {
      const fp = new THREE.Mesh(
        new THREE.PlaneGeometry(12 + i * 3, 2 + i * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x8aaa88, transparent: true, opacity: 0.025 + i * 0.008, depthWrite: false, side: THREE.DoubleSide })
      );
      fp.rotation.x = -Math.PI / 2;
      fp.position.set((Math.random() - 0.5) * 8, 0.2 + i * 0.12, (Math.random() - 0.5) * 8);
      fp.userData.speed = 0.3 + Math.random() * 0.4;
      fp.userData.offset = Math.random() * Math.PI * 2;
      scene.add(fp); fogPlanes.push(fp);
    }

    // Camera controls
    let isDragging = false, prevMouse = { x: 0, y: 0 };
    let theta = 0, phi = 0.35, radius = 22;
    let targetTheta = 0, targetPhi = 0.35, targetRadius = 22;
    let fogOn = true;

    canvas.addEventListener('mousedown', e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x, dy = e.clientY - prevMouse.y;
      targetTheta -= dx * 0.008;
      targetPhi = Math.max(0.12, Math.min(1.1, targetPhi + dy * 0.006));
      prevMouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', e => { targetRadius = Math.max(6, Math.min(45, targetRadius + e.deltaY * 0.03)); }, { passive: true });

    canvas.addEventListener('touchstart', e => { isDragging = true; prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
    canvas.addEventListener('touchend', () => isDragging = false);
    canvas.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - prevMouse.x, dy = e.touches[0].clientY - prevMouse.y;
      targetTheta -= dx * 0.01;
      targetPhi = Math.max(0.12, Math.min(1.1, targetPhi + dy * 0.008));
      prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    // Click interaction
    const raycaster = new THREE.Raycaster();
    const mouse2D = new THREE.Vector2();
    const tooltip = document.getElementById('tooltip');
    canvas.addEventListener('click', e => {
      mouse2D.x = (e.clientX / innerWidth) * 2 - 1;
      mouse2D.y = -(e.clientY / innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse2D, camera);
      const allMeshes = [];
      graveMeshes.forEach(g => g.children.forEach(c => { c.userData.parent = g; allMeshes.push(c); }));
      const hits = raycaster.intersectObjects(allMeshes);
      if (hits.length > 0) {
        const g = hits[0].object.userData.parent || hits[0].object;
        const d = g.userData;
        if (d && d.name) {
          document.getElementById('tt-name').textContent = d.name;
          document.getElementById('tt-dates').textContent = `${d.born} – ${d.died} · ${d.died - d.born} años`;
          document.getElementById('tt-epi').textContent = d.epi || '';
          tooltip.style.display = 'block';
          clearTimeout(tooltip._t);
          tooltip._t = setTimeout(() => tooltip.style.display = 'none', 3500);
        }
      } else {
        tooltip.style.display = 'none';
      }
    });

    function resetCam() { targetTheta = 0; targetPhi = 0.35; targetRadius = 22; }
    function toggleFog() {
      fogOn = !fogOn;
      scene.fog.density = fogOn ? 0.055 : 0.012;
    }

    window.addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    });

    let t = 0;
    function animate() {
      requestAnimationFrame(animate);
      t += 0.008;
      theta += (targetTheta - theta) * 0.07;
      phi += (targetPhi - phi) * 0.07;
      radius += (targetRadius - radius) * 0.07;
      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = radius * Math.sin(phi);
      camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(0, 1, 0);
      fogPlanes.forEach(fp => {
        fp.position.x += Math.sin(t * fp.userData.speed + fp.userData.offset) * 0.008;
        fp.position.z += Math.cos(t * fp.userData.speed * 0.7 + fp.userData.offset) * 0.006;
      });
      lanternLight1.intensity = 1.0 + Math.sin(t * 3.1) * 0.25;
      lanternLight2.intensity = 1.0 + Math.sin(t * 2.7 + 1) * 0.25;
      moon.position.x = 14 + Math.sin(t * 0.04) * 2;
      moonLight.position.copy(moon.position);
      stars.rotation.y += 0.0001;
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>

</html>