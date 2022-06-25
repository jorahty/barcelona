import * as THREE from './three.module.js';

class Plankton {
  constructor(x, y, z, isSpecial=false) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.isSpecial = isSpecial;

    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x, y, z]), 3));
    geometry.setAttribute('scale', new THREE.BufferAttribute(new Float32Array([1]), 1));

    let material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color( 0x77cc33 ) },
      },
      vertexShader: `
        attribute float scale;
  
        void main() {
  
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  
          gl_PointSize = scale * ( 300.0 / - mvPosition.z );
  
          gl_Position = projectionMatrix * mvPosition;
  
        }
      `,
      fragmentShader: `
        uniform vec3 color;
  
        void main() {
  
          if ( length( gl_PointCoord - vec2( 0.5, 0.5 ) ) > 0.475 ) discard;
  
          gl_FragColor = vec4( color, 1.0 );
  
        }
      `
    });
  
    this.mesh = new THREE.Points(geometry, material);
  }
}

class Fish {
  constructor(x, y, z, phi, theta, size) {

    // create mesh
    let geometry = new THREE.CylinderGeometry(0.2, 0.2, 1.3, 16);
    geometry.rotateX(Math.PI/2);
    let material = new THREE.MeshMatcapMaterial({ color: rand(0, 0xffffff) });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.order = 'YXZ';

    this.phi = phi;
    this.theta = theta;
    this.size = size;
    
    this.velocity = 0;

    this.controls = {
      t: false,
      r: new Set()
    };


    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(this.phi, this.theta, 0);
    this.mesh.scale.set(this.size, this.size, this.size);
  }

  grow() {
    this.size += 1;
    this.mesh.scale.set(this.size, this.size, this.size);
  }

  move() {
    // translate
    if (this.controls.t) {
      this.velocity = Math.min(this.velocity + 0.05, 1);
    } else {
      this.velocity = Math.max(this.velocity - this.velocity * 0.1 - 0.001, 0);
    }
    this.mesh.translateZ(-1 * this.velocity ** 0.6);

    // rotate
    if (this.controls.r.has('w')) this.theta = Math.min(this.theta + 0.07, Math.PI/2);
    if (this.controls.r.has('a')) this.phi += 0.07;
    if (this.controls.r.has('s')) this.theta = Math.max(this.theta - 0.07, -Math.PI/2);
    if (this.controls.r.has('d')) this.phi -= 0.07;

    this.mesh.rotation.y = this.phi;
    this.mesh.rotation.x = this.theta;
  }

  contains(p) {

    let x = p.x - this.mesh.position.x;
    let y = p.y - this.mesh.position.y;
    let z = p.z - this.mesh.position.z;

    // rotate x, y, z about the origin by -phi and -theta
    let result = rotateBy(x, y, z, -this.phi, -this.theta);

    return this.localContains(result.x, result.y, result.z);
  }

  localContains(x, y, z) {
    let l = 1.3 * this.size;
    let r = 0.2 * this.size;

    // return false if z out of range
    if (z < -l/2 || z > l/2) return false;
    // return true if xy distance less than radius
    return Math.hypot(x, y) <= r;
  }
}

function rotateBy(x, y, z, phi, theta) {
  let result = {};

  // rotate phi about y axis
  result.x = Math.cos(phi) * x + Math.sin(phi) * z;
  let z1 = -Math.sin(phi) * x + Math.cos(phi) * z;

  // rotate theta about x axis
  result.y = Math.cos(theta) * y - Math.sin(theta) * z1;
  result.z = Math.sin(theta) * y + Math.cos(theta) * z1;

  return result;
}

// return random number in [a, b]
// rounded to the nearest hundredth
function rand(a=-100, b=100) {
  let n = a + (b - a) * Math.random();
  return Math.round(n * 100) / 100;
}

// create scene
function createScene() {
  let scene = new THREE.Scene();

  scene.fog = new THREE.Fog(0x115f9f, 1, 80); // add fog

  // create background
  const ctx = document.createElement('canvas').getContext('2d');
  let h = 50;
  ctx.canvas.height = h;
  ctx.canvas.width = h * 2;
  var grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0.2, "#4397DE");
  grd.addColorStop(0.5, "#275B94");
  grd.addColorStop(0.8, "#133563");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.encoding = THREE.sRGBEncoding;
  scene.background = texture;

  return scene;
}

class Point { // don't use Vector3 because no three on server
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

class AABB { // axis-aligned bounding bin
  constructor(x, y, z, r) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.r = r;
  }

  contains(point) {
    return (
      point.x <= this.x + this.r &&
      point.x >= this.x - this.r &&
      point.y <= this.y + this.r &&
      point.y >= this.y - this.r &&
      point.z <= this.z + this.r &&
      point.z >= this.z - this.r
    );
  }

  cantIntersect(fish) {

    // add hypot(fish.l/2, fish.r) as padding of this bin.
    // return true if that bin doesnt contain fish position

    let fishLength = fish.size * 0.2;
    let fishRadius = fish.size * 1.3;
    
    let r = this.r + Math.hypot(fishLength/2, fishRadius);

    let generous = new AABB(this.x, this.y, this.z, r);

    let fishX = fish.mesh.position.x;
    let fishY = fish.mesh.position.y;
    let fishZ = fish.mesh.position.z;
    return generous.contains(new Point(fishX, fishY, fishZ)) == false;

  }
}

class OcTree {
  constructor(bin, scene) {
    this.bin = bin;
    this.capacity = 4;
    this.points = new Set();
    this.divided = false;

    this.scene = scene;
  }

  divide() { // create 8 children
    let x = this.bin.x;
    let y = this.bin.y;
    let z = this.bin.z;
    let r = this.bin.r;

    let trf = new AABB(x + r/2, y + r/2, z + r/2, r/2);
    let tlf = new AABB(x - r/2, y + r/2, z + r/2, r/2);
    let blf = new AABB(x - r/2, y - r/2, z + r/2, r/2);
    let brf = new AABB(x + r/2, y - r/2, z + r/2, r/2);
    let trb = new AABB(x + r/2, y + r/2, z - r/2, r/2);
    let tlb = new AABB(x - r/2, y + r/2, z - r/2, r/2);
    let blb = new AABB(x - r/2, y - r/2, z - r/2, r/2);
    let brb = new AABB(x + r/2, y - r/2, z - r/2, r/2);

    this.topRightFront = new OcTree(trf, this.scene);
    this.topLeftFront = new OcTree(tlf, this.scene);
    this.bottomLeftFront = new OcTree(blf, this.scene);
    this.bottomRightFront = new OcTree(brf, this.scene);
    this.topRightBack = new OcTree(trb, this.scene);
    this.topLeftBack = new OcTree(tlb, this.scene);
    this.bottomLeftBack = new OcTree(blb, this.scene);
    this.bottomRightBack = new OcTree(brb, this.scene);

    this.divided = true;
  }

  insert(plankton) {

    if (this.bin.contains(plankton) == false) return false; // abort

    if (this.points.size < this.capacity && this.divided == false) {
      this.points.add(plankton); // base case
      this.scene.add(plankton.mesh);
      return true;
    }

    if (this.divided == false) this.divide(); // divide if needed

    // recursive case
    if (this.topRightFront.insert(plankton)) return true;
    if (this.topLeftFront.insert(plankton)) return true;
    if (this.bottomLeftFront.insert(plankton)) return true;
    if (this.bottomRightFront.insert(plankton)) return true;
    if (this.topRightBack.insert(plankton)) return true;
    if (this.topLeftBack.insert(plankton)) return true;
    if (this.bottomLeftBack.insert(plankton)) return true;
    if (this.bottomRightBack.insert(plankton)) return true;

    return false;
  }

  // pop points eaten by fish
  eat(fish) {

    let eaten = []; // prepare array of results

    // abort if no chance of intersection
    if (this.bin.cantIntersect(fish)) return eaten; // abort

    // return all points if bin inside fish

    for (let p of this.points) { // pop points at this octant level
      if (fish.contains(p)) {
        eaten.push(p);
        this.points.delete(p);
        this.scene.remove(p.mesh);
      }
    }

    if (this.divided == false) return eaten; // abort if no children

    // add points from children
    eaten = eaten.concat(this.topRightFront.eat(fish));
    eaten = eaten.concat(this.topLeftFront.eat(fish));
    eaten = eaten.concat(this.bottomLeftFront.eat(fish));
    eaten = eaten.concat(this.bottomRightFront.eat(fish));
    eaten = eaten.concat(this.topRightBack.eat(fish));
    eaten = eaten.concat(this.topLeftBack.eat(fish));
    eaten = eaten.concat(this.bottomLeftBack.eat(fish));
    eaten = eaten.concat(this.bottomRightBack.eat(fish));

    return eaten;

  }
}

// all this cube-cylinder-point collision/intersection/encapsulation
// makes me want to use pre-built library
// I think three has such thing. boxContains or something
// actually idk if there is such thing. usually just for axis-aligned boxes & spheres

// you could also have the hitbox be a sequence of 4 spheres or so
// or a sequence of 4 axis-aligned squares
// each square is delayed by the others, like slither.io
// but then length would depend on speed
// you could do constant speed ████

// you could also have janky hitboxes
// like a sphere that isn't quite right

// could have the hitbox be a sphere by the mouth
// the rest of the fish is just rendered
// for a fish to be eaten mouth has to touch mouth ███



// create scene
let scene = createScene();

// create camera
let camera = new THREE.PerspectiveCamera(107, window.innerWidth / window.innerHeight, 0.1, 100);

// create renderer
let renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth / 1, window.innerHeight / 1);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.append(renderer.domElement);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = 'auto';

// add main fish to scene
let fish = new Fish(0, 0, 0, 0, 0, 1);
scene.add(fish.mesh);

// add other fish to scene
for (let i = 0; i < 100; i++) scene.add((new Fish(rand(), rand(), rand(), rand(-Math.PI/2, Math.PI/2), rand(0, Math.PI*2), Math.exp(rand(1, 4)))).mesh);

// create octree for plankton
let planktons = new OcTree(new AABB(0, 0, 0, 100), scene);

// create plankton
for (let i = 0; i < 800; i++) {
 
  let p = new Plankton(rand(), rand(), rand());

  planktons.insert(p);
}

// simulate/tick forward in time
function tick() {

  // move fish mesh with respect to fish controls
  fish.move();

  // move camera relative to player
  let offset = new THREE.Vector3(0, 1.4 * fish.size, 2.5 * fish.size);
  offset.applyQuaternion(fish.mesh.quaternion);
  offset.add(fish.mesh.position);
  camera.position.lerp(offset, 0.2);
  camera.quaternion.slerp(fish.mesh.quaternion, 0.2);

  // check if fish grew just now!

  let eaten = planktons.eat(fish);
  for (let _ of eaten) {
    fish.grow(scene);
    console.log(camera.far);
    scene.fog.far = 80 + fish.size * 4;
    camera.far = 100 + fish.size * 4;
    camera.updateProjectionMatrix();
    planktons.insert(new Plankton(rand(), rand(), rand()));
  }
  
}

// render scene from camera before each frame
function animate() {
  requestAnimationFrame(animate);

  renderer.render(scene, camera);
}

// config controls
onkeydown = e => {
  if (e.key === ' ') fish.controls.t = true;
  if ('wasd'.includes(e.key)) fish.controls.r.add(e.key);
}
onkeyup = e => {
  if (e.key === ' ') fish.controls.t = false;
  if (fish.controls.r.has(e.key)) fish.controls.r.delete(e.key);
}

animate(); // start rendering!

setInterval(tick, 1000 / 30); // start simulating!