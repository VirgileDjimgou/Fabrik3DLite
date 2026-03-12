import * as THREE from 'three'

export interface LinkMeshConfig {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  position?: THREE.Vector3
  rotation?: THREE.Euler
}

/**
 * A visual link segment of the robot arm.
 * Groups one or more meshes that are attached to a joint.
 */
export class RobotLink {
  readonly group: THREE.Group

  constructor(name: string, meshes: LinkMeshConfig[]) {
    this.group = new THREE.Group()
    this.group.name = name

    for (const cfg of meshes) {
      const mesh = new THREE.Mesh(cfg.geometry, cfg.material)
      if (cfg.position) mesh.position.copy(cfg.position)
      if (cfg.rotation) mesh.rotation.copy(cfg.rotation)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
    }
  }

  /** Dispose all geometries and materials owned by this link. */
  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mat = child.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })
  }
}
