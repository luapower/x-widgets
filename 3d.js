/*

	3D math lib.
	Written by Cosmin Apreutesei.

	Code from three.js and glMatrix, MIT License.

	v2 [x, y]
		* add sub mul div
		set assign sets clone equals from_array to_array
		len len2 set_len normalize
		add adds sub subs negate mul muls div divs min max dot
		transform(mat3)

	v3 [x, y, z]
		* add sub mul div cross
		set assign sets clone equals from_array to_array
		len len2 set_len normalize
		add adds sub subs negate mul muls div divs min max dot cross
		angle_to distance_to distance2_to
		transform(mat3|mat4|quaternion)

	v4 [x, y, z, w]
		* add sub mul div
		set assign sets clone equals from_array to_array
		len len2 set_len normalize
		add adds sub subs negate mul muls div divs min max dot
		transform(mat4)

	mat3, mat3f32 [e11, e21, e31, e12, e22, e32, e13, e23, e33]
		* mul
		set assign reset clone equals from_array to_array
		transpose det invert
		mul premul muls scale rotate translate

	mat4, mat4f32 [e11, e21, e31, e41, e12, e22, e32, e42, e13, e23, e33, e43, e14, e24, e34, e44]
		* mul
		set assign reset clone equals from_array to_array
		transpose det invert
		mul premul muls scale set_position translate rotate
		frustum perspective ortho look_at

	quat [x, y, z, w]
		set assign reset clone equals from_array to_array
		set_from_axis_angle set_from_rotation_matrix set_from_unit_vectors
		len2 len normalize rotate_towards conjugate invert
		angle_to dot mul premul slerp

	plane {constant:, normal:}
		set assign clone equals normalize negate
		set_from_normal_and_coplanar_point set_from_coplanar_points set_from_poly
		distance_to_point distance_to_sphere project_point
		intersect_line intersects_line intersects_box intersects_sphere
		complanar_point transform translate

	triangle3 [a, b, c]
		* normal barycoord contains_point uv is_front_facing
		set assign clone equals
		set_from_points_and_indices
		area midpoint normal plane barycoord uv contains_point is_front_facing intersects_box

	box3

	sphere

	poly3
		% point_count get_point
		project_xy is_convex_quad triangulate

	line3 [p0, p1]
		set clone equals
		center delta distance2 distance at
		closest_point_to_point_t closest_point_to_point
		apply_mat4

*/

{

// v2 ------------------------------------------------------------------------

let v2c = class v extends Array {

	constructor(x, y) {
		super(x || 0, y || 0)
	}

	set(x, y) {
		if (isarray(x)) {
			let v = x
			x = v[0]
			y = v[1]
		}
		this[0] = x
		this[1] = y
		return this
	}

	assign(v) {
		assert(v.is_v2)
		return assign(this, v)
	}

	sets(s) {
		this[0] = s
		this[1] = s
		return this
	}

	clone() {
		return v2(this[0], this[1])
	}

	equals(v) {
		return (
			v[0] === this[0] &&
			v[1] === this[1]
		)
	}

	from_array(a, i) {
		this[0] = a[i  ]
		this[1] = a[i+1]
		return this
	}

	to_array(a, i) {
		a[i  ] = this[0]
		a[i+1] = this[1]
		return a
	}

	len2() {
		return (
			this[0] ** 2 +
			this[1] ** 2
		)
	}

	len() {
		return sqrt(this.len2())
	}

	normalize() {
		return this.divs(this.len() || 1)
	}

	set_len(v) {
		return this.normalize().muls(v)
	}

	add(v, s) {
		s = or(s, 1)
		this[0] += v[0] * s
		this[1] += v[1] * s
		return this
	}

	adds(s) {
		this[0] += s
		this[1] += s
		return this
	}

	sub(v) {
		this[0] -= v[0]
		this[1] -= v[1]
		return this
	}

	subs(s) {
		this[0] -= s
		this[1] -= s
		return this
	}

	negate() {
		this[0] = -this[0]
		this[1] = -this[1]
		return this
	}

	mul(v) {
		this[0] *= v[0]
		this[1] *= v[1]
		return this
	}

	muls(s) {
		this[0] *= s
		this[1] *= s
		return this
	}

	div(v) {
		this[0] /= v[0]
		this[1] /= v[1]
		return this
	}

	divs(s) {
		return this.muls(1 / s)
	}

	min(v) {
		this[0] = min(this[0], v[0])
		this[1] = min(this[1], v[1])
		return this
	}

	max(v) {
		this[0] = max(this[0], v[0])
		this[1] = max(this[1], v[1])
		return this
	}

	dot(v) {
		return (
			this[0] * v[0] +
			this[1] * v[1]
		)
	}

	transform(arg) {
		let x = this[0]
		let y = this[1]
		if (arg.is_mat3) {
			var m = arg
			this[0] = m[0] * x + m[3] * y + m[6]
			this[1] = m[1] * x + m[4] * y + m[7]
		} else
			assert(false)
		return this
	}
}

v2c.prototype.is_v2 = true

property(v2c, 'x', function() { return this[0] }, function(v) { this[0] = v })
property(v2c, 'y', function() { return this[1] }, function(v) { this[1] = v })

v2 = function v2(x, y) { return new v2c(x, y) }

v2.add = function add(a, b, s, out) {
	s = or(s, 1)
	out[0] = (a[0] + b[0]) * s
	out[1] = (a[1] + b[1]) * s
	return out
}

v2.sub = function sub(a, b, out) {
	out[0] = a[0] - b[0]
	out[1] = a[1] - b[1]
	return out
}

v2.mul = function mul(a, b, out) {
	out[0] = a[0] * b[0]
	out[1] = a[1] * b[1]
	return out
}

v2.div = function div(a, b, out) {
	out[0] = a[0] / b[0]
	out[1] = a[1] / b[1]
	return out
}

// v3 ------------------------------------------------------------------------

let v3c = class v extends Array {

	constructor(x, y, z) {
		super(x || 0, y || 0, z || 0)
	}

	set(x, y, z) {
		if (isarray(x)) {
			let v = x
			x = v[0]
			y = v[1]
			z = v[2]
		}
		this[0] = x
		this[1] = y
		this[2] = z
		return this
	}

	assign(v) {
		assert(v.is_v3)
		return assign(this, v)
	}

	sets(s) {
		this[0] = s
		this[1] = s
		this[2] = s
		return this
	}

	clone() {
		return v3(this[0], this[1], this[2])
	}

	equals(v) {
		return (
			v[0] === this[0] &&
			v[1] === this[1] &&
			v[2] === this[2]
		)
	}

	from_array(a, i) {
		this[0] = a[i  ]
		this[1] = a[i+1]
		this[2] = a[i+2]
		return this
	}

	to_array(a, i) {
		a[i  ] = this[0]
		a[i+1] = this[1]
		a[i+2] = this[2]
		return a
	}

	len2() {
		return (
			this[0] ** 2 +
			this[1] ** 2 +
			this[2] ** 2
		)
	}

	len() {
		return sqrt(this.len2())
	}

	normalize() {
		return this.divs(this.len() || 1)
	}

	set_len(v) {
		return this.normalize().muls(v)
	}

	add(v, s) {
		s = or(s, 1)
		this[0] += v[0] * s
		this[1] += v[1] * s
		this[2] += v[2] * s
		return this
	}

	adds(s) {
		this[0] += s
		this[1] += s
		this[2] += s
		return this
	}

	sub(v) {
		this[0] -= v[0]
		this[1] -= v[1]
		this[2] -= v[2]
		return this
	}

	subs(s) {
		this[0] -= s
		this[1] -= s
		this[2] -= s
		return this
	}

	negate() {
		this[0] = -this[0]
		this[1] = -this[1]
		this[2] = -this[2]
		return this
	}

	mul(v) {
		this[0] *= v[0]
		this[1] *= v[1]
		this[2] *= v[2]
		return this
	}

	muls(s) {
		this[0] *= s
		this[1] *= s
		this[2] *= s
		return this
	}

	div(v) {
		this[0] /= v[0]
		this[1] /= v[1]
		this[2] /= v[2]
		return this
	}

	divs(s) {
		return this.muls(1 / s)
	}

	min(v) {
		this[0] = min(this[0], v[0])
		this[1] = min(this[1], v[1])
		this[2] = min(this[2], v[2])
		return this
	}

	max(v) {
		this[0] = max(this[0], v[0])
		this[1] = max(this[1], v[1])
		this[2] = max(this[2], v[2])
		return this
	}

	dot(v) {
		return (
			this[0] * v[0] +
			this[1] * v[1] +
			this[2] * v[2]
		)
	}

	cross(b) {
		return v3.cross(this, b, this)
	}

	angle_to(v) {
		let den = sqrt(this.len2() * v.len2())
		if (den == 0) return PI / 2
		let theta = this.dot(v) / den // clamp, to handle numerical problems
		return acos(clamp(theta, -1, 1))
	}

	distance2_to(v) {
		let dx = this[0] - v[0]
		let dy = this[1] - v[1]
		let dz = this[2] - v[2]
		return (
			dx ** 2 +
			dy ** 2 +
			dz ** 2
		)
	}

	distance_to(v) {
		return sqrt(this.distance2_to(v))
	}

	transform(arg) {

		let x = this[0]
		let y = this[1]
		let z = this[2]

		if (arg.is_quat) {

			let qx = arg[0]
			let qy = arg[1]
			let qz = arg[2]
			let qw = arg[3] // calculate quat * vector

			let ix = qw * x + qy * z - qz * y
			let iy = qw * y + qz * x - qx * z
			let iz = qw * z + qx * y - qy * x
			let iw = -qx * x - qy * y - qz * z // calculate result * inverse quat

			this[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy
			this[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz
			this[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx

		} else if (arg.is_mat3) {

			let m = arg
			this[0] = m[0] * x + m[3] * y + m[6] * z
			this[1] = m[1] * x + m[4] * y + m[7] * z
			this[2] = m[2] * x + m[5] * y + m[8] * z

		} else if (arg.is_mat4) {

			let m = arg
			let w = 1 / (m[3] * x + m[7] * y + m[11] * z + m[15])
			this[0] = (m[0] * x + m[4] * y + m[ 8] * z + m[12]) * w
			this[1] = (m[1] * x + m[5] * y + m[ 9] * z + m[13]) * w
			this[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * w

		} else
			assert(false)

		return this
	}
}

v3c.prototype.is_v3 = true

property(v3c, 'x', function() { return this[0] }, function(v) { this[0] = v })
property(v3c, 'y', function() { return this[1] }, function(v) { this[1] = v })
property(v3c, 'z', function() { return this[2] }, function(v) { this[2] = v })

v3 = function v3(x, y, z) { return new v3c(x, y, z) }

v3.cross = function(a, b, out) {
	let ax = a[0]
	let ay = a[1]
	let az = a[2]
	let bx = b[0]
	let by = b[1]
	let bz = b[2]
	out[0] = ay * bz - az * by
	out[1] = az * bx - ax * bz
	out[2] = ax * by - ay * bx
	return out
}

v3.add = function add(a, b, s, out) {
	s = or(s, 1)
	out[0] = a[0] + b[0] * s
	out[1] = a[1] + b[1] * s
	out[2] = a[2] + b[2] * s
	return out
}

v3.sub = function sub(a, b, out) {
	out[0] = a[0] - b[0]
	out[1] = a[1] - b[1]
	out[2] = a[2] - b[2]
	return out
}

v3.mul = function mul(a, b, out) {
	out[0] = a[0] * b[0]
	out[1] = a[1] * b[1]
	out[2] = a[2] * b[2]
	return out
}

v3.div = function div(a, b, out) {
	out[0] = a[0] / b[0]
	out[1] = a[1] / b[1]
	out[2] = a[2] / b[2]
	return out
}

// temporaries for plane and triangle methods.
let _v0 = v3()
let _v1 = v3()
let _v2 = v3()
let _v3 = v3()

// v4 ------------------------------------------------------------------------

let v4c = class v extends Array {

	constructor(x, y, z, w) {
		super(x || 0, y || 0, z || 0, or(w, 1))
	}

	set(x, y, z, w) {
		if (isarray(x)) {
			let v = x
			x = v[0]
			y = v[1]
			z = v[2]
			w = v[3]
		}
		this[0] = x
		this[1] = y
		this[2] = z
		this[3] = w
		return this
	}

	assign(v) {
		assert(v.is_v4)
		return assign(this, v)
	}

	sets(s) {
		this[0] = s
		this[1] = s
		this[2] = s
		this[3] = s
		return this
	}

	clone() {
		return v4().set(this[0], this[1], this[2], this[3])
	}

	equals(v) {
		return (
			v[0] === this[0] &&
			v[1] === this[1] &&
			v[2] === this[2] &&
			v[3] === this[3]
		)
	}

	from_array(a, i) {
		this[0] = a[i  ]
		this[1] = a[i+1]
		this[2] = a[i+2]
		this[3] = a[i+3]
		return this
	}

	to_array(a, i) {
		a[i  ] = this[0]
		a[i+1] = this[1]
		a[i+2] = this[2]
		a[i+3] = this[3]
		return a
	}

	len2() {
		return (
			this[0] ** 2 +
			this[1] ** 2 +
			this[2] ** 2 +
			this[3] ** 2
		)
	}

	len() {
		return sqrt(this.len2())
	}

	normalize() {
		return this.divs(this.len() || 1)
	}

	set_len(len) {
		return this.normalize().muls(len)
	}

	add(v, s) {
		s = or(s, 1)
		this[0] += v[0] * s
		this[1] += v[1] * s
		this[2] += v[2] * s
		this[3] += v[3] * s
		return this
	}

	adds(s) {
		this[0] += s
		this[1] += s
		this[2] += s
		this[3] += s
		return this
	}

	sub(v) {
		this[0] -= v[0]
		this[1] -= v[1]
		this[2] -= v[2]
		this[3] -= v[3]
		return this
	}

	subs(s) {
		this[0] -= s
		this[1] -= s
		this[2] -= s
		this[3] -= s
		return this
	}

	mul(v) {
		this[0] *= v[0]
		this[1] *= v[1]
		this[2] *= v[2]
		this[3] *= v[3]
		return this
	}

	muls(s) {
		this[0] *= s
		this[1] *= s
		this[2] *= s
		this[3] *= s
		return this
	}

	div(v) {
		this[0] /= v[0]
		this[1] /= v[1]
		this[2] /= v[2]
		this[3] /= v[3]
		return this
	}

	divs(s) {
		return this.muls(1 / s)
	}

	min(v) {
		this[0] = min(this[0], v[0])
		this[1] = min(this[1], v[1])
		this[2] = min(this[2], v[2])
		this[3] = min(this[3], v[3])
		return this
	}

	max(v) {
		this[0] = max(this[0], v[0])
		this[1] = max(this[1], v[1])
		this[2] = max(this[2], v[2])
		this[3] = max(this[3], v[3])
		return this
	}

	negate() {
		this[0] = -this[0]
		this[1] = -this[1]
		this[2] = -this[2]
		this[3] = -this[3]
		return this
	}

	dot(v) {
		return (
			this[0] * v[0] +
			this[1] * v[1] +
			this[2] * v[2] +
			this[3] * v[3]
		)
	}

	transform(arg) {
		if (arg.is_mat4) {
			let x = this[0]
			let y = this[1]
			let z = this[2]
			let w = this[3]
			let m = arg
			this[0] = m[0] * x + m[4] * y + m[ 8] * z + m[12] * w
			this[1] = m[1] * x + m[5] * y + m[ 9] * z + m[13] * w
			this[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w
			this[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w
		} else
			assert(false)
		return this
	}

}

v4c.prototype.is_v4 = true

property(v4c, 'x', function() { return this[0] }, function(v) { this[0] = v })
property(v4c, 'y', function() { return this[1] }, function(v) { this[1] = v })
property(v4c, 'z', function() { return this[2] }, function(v) { this[2] = v })
property(v4c, 'w', function() { return this[3] }, function(v) { this[3] = v })

v4 = function v4(x, y, z, w) { return new v4c(x, y, z, w) }

v4.add = function add(a, v, s, out) {
	s = or(s, 1)
	out[0] = a[0] + v[0] * s
	out[1] = a[1] + v[1] * s
	out[2] = a[2] + v[2] * s
	out[3] = a[3] + v[3] * s
	return out
}

v4.sub = function sub(a, v, out) {
	out[0] = a[0] - v[0]
	out[1] = a[1] - v[1]
	out[2] = a[2] - v[2]
	out[3] = a[3] - v[3]
	return out
}

v4.mul = function mul(a, v, out) {
	out[0] = a[0] * v[0]
	out[1] = a[1] * v[1]
	out[2] = a[2] * v[2]
	out[3] = a[3] * v[3]
	return out
}

v4.div = function div(a, v, out) {
	out[0] = a[0] / v[0]
	out[1] = a[1] / v[1]
	out[2] = a[2] / v[2]
	out[3] = a[3] / v[3]
	return out
}

// mat3 ----------------------------------------------------------------------

let mat3_type = function(super_class, super_args) {

	let mat3c = class m extends super_class {

		constructor() {
			super(...super_args)
		}

		set(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
			let a = this
			if (n11.is_mat3)
				return this.from_array(n11, 0)
			if (n11.is_mat4) {
				let a = n11
				return this.set(
					a[0], a[4], a[ 8],
					a[1], a[5], a[ 9],
					a[2], a[6], a[10])
			} else {
				a[0] = n11
				a[1] = n21
				a[2] = n31
				a[3] = n12
				a[4] = n22
				a[5] = n32
				a[6] = n13
				a[7] = n23
				a[8] = n33
			}
			return this
		}

		assign(m) {
			assert(m.is_mat3)
			assign(this, m)
			return this
		}

		reset() {
			return this.set(
				1, 0, 0,
				0, 1, 0,
				0, 0, 1)
		}

		clone() {
			return mat3().set(this)
		}

		equals(m) {
			for (let i = 0; i < 9; i++)
				if (this[i] !== m[i])
					return false
			return true
		}

		from_array(a, ai) {
			for (let i = 0; i < 9; i++)
				this[i] = a[ai + i]
			return this
		}

		to_array(a, ai) {
			for (let i = 0; i < 9; i++)
				a[ai + i] = this[i]
			return a
		}

		transpose() {
			let tmp
			let m = this
			tmp = m[1]; m[1] = m[3]; m[3] = tmp
			tmp = m[2]; m[2] = m[6]; m[6] = tmp
			tmp = m[5]; m[5] = m[7]; m[7] = tmp
			return this
		}

		det() {
			let a = this[0]
			let b = this[1]
			let c = this[2]
			let d = this[3]
			let e = this[4]
			let f = this[5]
			let g = this[6]
			let h = this[7]
			let i = this[8]
			return a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g
		}

		invert() {
			let n11 = this[0]
			let n21 = this[1]
			let n31 = this[2]
			let n12 = this[3]
			let n22 = this[4]
			let n32 = this[5]
			let n13 = this[6]
			let n23 = this[7]
			let n33 = this[8]
			let t11 = n33 * n22 - n32 * n23
			let t12 = n32 * n13 - n33 * n12
			let t13 = n23 * n12 - n22 * n13
			let det = n11 * t11 + n21 * t12 + n31 * t13
			if (det === 0)
				return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0)
			let detInv = 1 / det
			this[0] = t11 * detInv
			this[1] = (n31 * n23 - n33 * n21) * detInv
			this[2] = (n32 * n21 - n31 * n22) * detInv
			this[3] = t12 * detInv
			this[4] = (n33 * n11 - n31 * n13) * detInv
			this[5] = (n31 * n12 - n32 * n11) * detInv
			this[6] = t13 * detInv
			this[7] = (n21 * n13 - n23 * n11) * detInv
			this[8] = (n22 * n11 - n21 * n12) * detInv
			return this
		}

		mul(m) {
			return mat3.mul(this, m, this)
		}

		premul(m) {
			return mat3.mul(m, this, this)
		}

		muls(s) {
			this[0] *= s
			this[3] *= s
			this[6] *= s
			this[1] *= s
			this[4] *= s
			this[7] *= s
			this[2] *= s
			this[5] *= s
			this[8] *= s
			return this
		}

		scale(sx, sy) {
			sy = or(sy, sx)
			this[0] *= sx
			this[3] *= sx
			this[6] *= sx
			this[1] *= sy
			this[4] *= sy
			this[7] *= sy
			return this
		}

		rotate(angle) {
			let c = cos(angle)
			let s = sin(angle)
			let a11 = this[0]
			let a12 = this[3]
			let a13 = this[6]
			let a21 = this[1]
			let a22 = this[4]
			let a23 = this[7]
			this[0] =  c * a11 + s * a21
			this[3] =  c * a12 + s * a22
			this[6] =  c * a13 + s * a23
			this[1] = -s * a11 + c * a21
			this[4] = -s * a12 + c * a22
			this[7] = -s * a13 + c * a23
			return this
		}

		translate(tx, ty) {
			this[0] += tx * this[2]
			this[3] += tx * this[5]
			this[6] += tx * this[8]
			this[1] += ty * this[2]
			this[4] += ty * this[5]
			this[7] += ty * this[8]
			return this
		}

	}

	mat3c.prototype.is_mat3 = true

	property(mat3c, 'e11', function() { return this[0] }, function(v) { this[0] = v })
	property(mat3c, 'e21', function() { return this[1] }, function(v) { this[1] = v })
	property(mat3c, 'e31', function() { return this[2] }, function(v) { this[2] = v })
	property(mat3c, 'e12', function() { return this[3] }, function(v) { this[3] = v })
	property(mat3c, 'e22', function() { return this[4] }, function(v) { this[4] = v })
	property(mat3c, 'e32', function() { return this[5] }, function(v) { this[5] = v })
	property(mat3c, 'e13', function() { return this[6] }, function(v) { this[6] = v })
	property(mat3c, 'e23', function() { return this[7] }, function(v) { this[7] = v })
	property(mat3c, 'e33', function() { return this[8] }, function(v) { this[8] = v })

	let mat3 = function() { return new mat3c() }

	mat3.mul = function mul(a, b, out) {

		let a11 = a[0]
		let a21 = a[1]
		let a31 = a[2]
		let a12 = a[3]
		let a22 = a[4]
		let a32 = a[5]
		let a13 = a[6]
		let a23 = a[7]
		let a33 = a[8]

		let b11 = b[0]
		let b21 = b[1]
		let b31 = b[2]
		let b12 = b[3]
		let b22 = b[4]
		let b32 = b[5]
		let b13 = b[6]
		let b23 = b[7]
		let b33 = b[8]

		out[0] = a11 * b11 + a12 * b21 + a13 * b31
		out[3] = a11 * b12 + a12 * b22 + a13 * b32
		out[6] = a11 * b13 + a12 * b23 + a13 * b33
		out[1] = a21 * b11 + a22 * b21 + a23 * b31
		out[4] = a21 * b12 + a22 * b22 + a23 * b32
		out[7] = a21 * b13 + a22 * b23 + a23 * b33
		out[2] = a31 * b11 + a32 * b21 + a33 * b31
		out[5] = a31 * b12 + a32 * b22 + a33 * b32
		out[8] = a31 * b13 + a32 * b23 + a33 * b33

		return out
	}

	return mat3

}

let mat3_ident = [1, 0, 0, 0, 1, 0, 0, 0, 1]
mat3    = mat3_type(Array, mat3_ident)
mat3f32 = mat3_type(f32arr, [mat3_ident])

// mat4 ----------------------------------------------------------------------

let mat4_type = function(super_class, super_args) {

	let mat4c = class m extends super_class {

		constructor() {
			super(...super_args)
		}

		set(
			n11, n12, n13, n14,
			n21, n22, n23, n24,
			n31, n32, n33, n34,
			n41, n42, n43, n44
		) {
			if (n11.is_mat4)
				return this.from_array(n11, 0)
			if (n11.is_mat3) {
				let m = n11
				return this.set(
					m[0], m[3], m[6], 0,
					m[1], m[4], m[7], 0,
					m[2], m[5], m[8], 1)
			} else {
				this[ 0] = n11
				this[ 1] = n21
				this[ 2] = n31
				this[ 3] = n41
				this[ 4] = n12
				this[ 5] = n22
				this[ 6] = n32
				this[ 7] = n42
				this[ 8] = n13
				this[ 9] = n23
				this[10] = n33
				this[11] = n43
				this[12] = n14
				this[13] = n24
				this[14] = n34
				this[15] = n44
			}
			return this
		}

		assign(m) {
			assert(m.is_mat4)
			assign(this, m)
			return this
		}

		reset() {
			return this.set(
				1, 0, 0, 0,
				0, 1, 0, 0,
				0, 0, 1, 0,
				0, 0, 0, 1)
		}

		clone() {
			return mat4().set(this)
		}

		equals(m) {
			for (let i = 0; i < 16; i++)
				if (this[i] !== m[i])
					return false
			return true
		}

		from_array(a, ai) {
			for (let i = 0; i < 16; i++)
				this[i] = a[ai + i]
			return this
		}

		to_array(a, ai) {
			for (let i = 0; i < 16; i++)
				a[ai + i] = this[i]
			return a
		}

		transpose() {
			let t
			let m = this
			t = m[ 1]; m[ 1] = m[ 4]; m[ 4] = t
			t = m[ 2]; m[ 2] = m[ 8]; m[ 8] = t
			t = m[ 6]; m[ 6] = m[ 9]; m[ 9] = t
			t = m[ 3]; m[ 3] = m[12]; m[12] = t
			t = m[ 7]; m[ 7] = m[13]; m[13] = t
			t = m[11]; m[11] = m[14]; m[14] = t
			return this
		}

		// http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm
		det() {
			let n11 = this[ 0]
			let n21 = this[ 1]
			let n31 = this[ 2]
			let n41 = this[ 3]
			let n12 = this[ 4]
			let n22 = this[ 5]
			let n32 = this[ 6]
			let n42 = this[ 7]
			let n13 = this[ 8]
			let n23 = this[ 9]
			let n33 = this[10]
			let n43 = this[11]
			let n14 = this[12]
			let n24 = this[13]
			let n34 = this[14]
			let n44 = this[15]
			return (
				  n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34)
				+ n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31)
				+ n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31)
				+ n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31)
			)
		}

		invert() {
			let a00 = this[ 0]
			let a01 = this[ 1]
			let a02 = this[ 2]
			let a03 = this[ 3]
			let a10 = this[ 4]
			let a11 = this[ 5]
			let a12 = this[ 6]
			let a13 = this[ 7]
			let a20 = this[ 8]
			let a21 = this[ 9]
			let a22 = this[10]
			let a23 = this[11]
			let a30 = this[12]
			let a31 = this[13]
			let a32 = this[14]
			let a33 = this[15]
			let b00 = a00 * a11 - a01 * a10
			let b01 = a00 * a12 - a02 * a10
			let b02 = a00 * a13 - a03 * a10
			let b03 = a01 * a12 - a02 * a11
			let b04 = a01 * a13 - a03 * a11
			let b05 = a02 * a13 - a03 * a12
			let b06 = a20 * a31 - a21 * a30
			let b07 = a20 * a32 - a22 * a30
			let b08 = a20 * a33 - a23 * a30
			let b09 = a21 * a32 - a22 * a31
			let b10 = a21 * a33 - a23 * a31
			let b11 = a22 * a33 - a23 * a32
			let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
			if (!det)
				return
			det = 1.0 / det
			this[ 0] = (a11 * b11 - a12 * b10 + a13 * b09) * det
			this[ 1] = (a02 * b10 - a01 * b11 - a03 * b09) * det
			this[ 2] = (a31 * b05 - a32 * b04 + a33 * b03) * det
			this[ 3] = (a22 * b04 - a21 * b05 - a23 * b03) * det
			this[ 4] = (a12 * b08 - a10 * b11 - a13 * b07) * det
			this[ 5] = (a00 * b11 - a02 * b08 + a03 * b07) * det
			this[ 6] = (a32 * b02 - a30 * b05 - a33 * b01) * det
			this[ 7] = (a20 * b05 - a22 * b02 + a23 * b01) * det
			this[ 8] = (a10 * b10 - a11 * b08 + a13 * b06) * det
			this[ 9] = (a01 * b08 - a00 * b10 - a03 * b06) * det
			this[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det
			this[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det
			this[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det
			this[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det
			this[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det
			this[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det
			return this
		}

		mul(m) {
			return mat4.mul(this, m, this)
		}

		premul(m) {
			return mat4.mul(m, this, this)
		}

		muls(s) {
			this[ 0] *= s
			this[ 1] *= s
			this[ 2] *= s
			this[ 3] *= s
			this[ 4] *= s
			this[ 5] *= s
			this[ 6] *= s
			this[ 7] *= s
			this[ 8] *= s
			this[ 9] *= s
			this[10] *= s
			this[11] *= s
			this[12] *= s
			this[13] *= s
			this[14] *= s
			this[15] *= s
			return this
		}

		scale(v) {
			let x = v[0]
			let y = v[1]
			let z = v[2]
			this[ 0] *= x
			this[ 4] *= y
			this[ 8] *= z
			this[ 1] *= x
			this[ 5] *= y
			this[ 9] *= z
			this[ 2] *= x
			this[ 6] *= y
			this[10] *= z
			this[ 3] *= x
			this[ 7] *= y
			this[11] *= z
			return this
		}

		set_position(x, y, z) {
			if (x.is_v3) {
				let v = x
				x = v[0]
				y = v[1]
				z = v[2]
			} else if (x.is_mat4) {
				let me = x.elements
				x = me[12]
				y = me[13]
				z = me[14]
			}
			this[12] = x
			this[13] = y
			this[14] = z
			return this
		}

		translate(x, y, z) {
			let m = this
			m[12] = m[0] * x + m[4] * y + m[ 8] * z + m[12]
			m[13] = m[1] * x + m[5] * y + m[ 9] * z + m[13]
			m[14] = m[2] * x + m[6] * y + m[10] * z + m[14]
			m[15] = m[3] * x + m[7] * y + m[11] * z + m[15]
			return this
		}

		rotate(angle, x, y, z) {
			if (x.is_v3 || x.is_v4) {
				let p = x
				x = p[0]
				y = p[1]
				z = p[2]
			}
			let len = Math.hypot(x, y, z)
			assert(len >= Number.EPSILON)
			len = 1 / len
			x *= len
			y *= len
			z *= len
			let s = sin(angle)
			let c = cos(angle)
			let t = 1 - c
			let a00 = this[ 0]
			let a01 = this[ 1]
			let a02 = this[ 2]
			let a03 = this[ 3]
			let a10 = this[ 4]
			let a11 = this[ 5]
			let a12 = this[ 6]
			let a13 = this[ 7]
			let a20 = this[ 8]
			let a21 = this[ 9]
			let a22 = this[10]
			let a23 = this[11]
			// construct the elements of the rotation matrix.
			let b00 = x * x * t + c
			let b01 = y * x * t + z * s
			let b02 = z * x * t - y * s
			let b10 = x * y * t - z * s
			let b11 = y * y * t + c
			let b12 = z * y * t + x * s
			let b20 = x * z * t + y * s
			let b21 = y * z * t - x * s
			let b22 = z * z * t + c
			// perform rotation-specific matrix multiplication.
			this[ 0] = a00 * b00 + a10 * b01 + a20 * b02
			this[ 1] = a01 * b00 + a11 * b01 + a21 * b02
			this[ 2] = a02 * b00 + a12 * b01 + a22 * b02
			this[ 3] = a03 * b00 + a13 * b01 + a23 * b02
			this[ 4] = a00 * b10 + a10 * b11 + a20 * b12
			this[ 5] = a01 * b10 + a11 * b11 + a21 * b12
			this[ 6] = a02 * b10 + a12 * b11 + a22 * b12
			this[ 7] = a03 * b10 + a13 * b11 + a23 * b12
			this[ 8] = a00 * b20 + a10 * b21 + a20 * b22
			this[ 9] = a01 * b20 + a11 * b21 + a21 * b22
			this[10] = a02 * b20 + a12 * b21 + a22 * b22
			this[11] = a03 * b20 + a13 * b21 + a23 * b22
			return this
		}

		frustum(left, right, bottom, top, near, far) {
			let rl = 1 / (right - left)
			let tb = 1 / (top - bottom)
			let nf = 1 / (near - far)
			this[ 0] = near * 2 * rl
			this[ 1] = 0
			this[ 2] = 0
			this[ 3] = 0
			this[ 4] = 0
			this[ 5] = near * 2 * tb
			this[ 6] = 0
			this[ 7] = 0
			this[ 8] = (right + left) * rl
			this[ 9] = (top + bottom) * tb
			this[10] = (far + near) * nf
			this[11] = -1
			this[12] = 0
			this[13] = 0
			this[14] = far * near * 2 * nf
			this[15] = 0
			return this
		}

		perspective(fovy, aspect, near, far) {
			let f = 1 / tan(fovy / 2)
			this[ 0] = f / aspect
			this[ 1] = 0
			this[ 2] = 0
			this[ 3] = 0
			this[ 4] = 0
			this[ 5] = f
			this[ 6] = 0
			this[ 7] = 0
			this[ 8] = 0
			this[ 9] = 0
			this[11] = -1
			this[12] = 0
			this[13] = 0
			this[15] = 0
			if (far != null && far !== Infinity) {
				let nf = 1 / (near - far)
				this[10] = (far + near) * nf
				this[14] = 2 * far * near * nf
			} else {
				this[10] = -1
				this[14] = -2 * near
			}
			return this
		}

		ortho(left, right, top, bottom, near, far) {
			let w = 1.0 / (right - left)
			let h = 1.0 / (top - bottom)
			let p = 1.0 / (far - near)
			let x = (right + left) * w
			let y = (top + bottom) * h
			let z = (far + near) * p
			this[ 0] = 2 * w
			this[ 4] = 0
			this[ 8] = 0
			this[12] = -x
			this[ 1] = 0
			this[ 5] = 2 * h
			this[ 9] = 0
			this[13] = -y
			this[ 2] = 0
			this[ 6] = 0
			this[10] = -2 * p
			this[14] = -z
			this[ 3] = 0
			this[ 7] = 0
			this[11] = 0
			this[15] = 1
			return this
		}

		// generates a look-at matrix with the given eye position, focal point, and up axis.
		//   eye    : position of the viewer
		//   center : point the viewer is looking at
		//   up     : vec3 pointing up
		look_at(eye, center, up) {
			let x0, x1, x2, y0, y1, y2, z0, z1, z2, len
			let eyex = eye[0]
			let eyey = eye[1]
			let eyez = eye[2]
			let upx = up[0]
			let upy = up[1]
			let upz = up[2]
			let cx = center[0]
			let cy = center[1]
			let cz = center[2]
			if (
				abs(eyex - cx) < Number.EPSILON &&
				abs(eyey - cy) < Number.EPSILON &&
				abs(eyez - cz) < Number.EPSILON
			) {
				return this.reset()
			}
			z0 = eyex - cx
			z1 = eyey - cy
			z2 = eyez - cz
			len = 1 / Math.hypot(z0, z1, z2)
			z0 *= len
			z1 *= len
			z2 *= len
			x0 = upy * z2 - upz * z1
			x1 = upz * z0 - upx * z2
			x2 = upx * z1 - upy * z0
			len = Math.hypot(x0, x1, x2)
			if (!len) {
				x0 = 0
				x1 = 0
				x2 = 0
			} else {
				len = 1 / len
				x0 *= len
				x1 *= len
				x2 *= len
			}
			y0 = z1 * x2 - z2 * x1
			y1 = z2 * x0 - z0 * x2
			y2 = z0 * x1 - z1 * x0
			len = Math.hypot(y0, y1, y2)
			if (!len) {
				y0 = 0
				y1 = 0
				y2 = 0
			} else {
				len = 1 / len
				y0 *= len
				y1 *= len
				y2 *= len
			}
			this[ 0] = x0
			this[ 1] = y0
			this[ 2] = z0
			this[ 3] = 0
			this[ 4] = x1
			this[ 5] = y1
			this[ 6] = z1
			this[ 7] = 0
			this[ 8] = x2
			this[ 9] = y2
			this[10] = z2
			this[11] = 0
			this[12] = -(x0 * eyex + x1 * eyey + x2 * eyez)
			this[13] = -(y0 * eyex + y1 * eyey + y2 * eyez)
			this[14] = -(z0 * eyex + z1 * eyey + z2 * eyez)
			this[15] = 1
			return this
		}

	}

	mat4c.prototype.is_mat4 = true

	property(mat4c, 'e11', function() { return this[ 0] }, function(v) { this[ 0] = v })
	property(mat4c, 'e21', function() { return this[ 1] }, function(v) { this[ 1] = v })
	property(mat4c, 'e31', function() { return this[ 2] }, function(v) { this[ 2] = v })
	property(mat4c, 'e41', function() { return this[ 3] }, function(v) { this[ 3] = v })
	property(mat4c, 'e12', function() { return this[ 4] }, function(v) { this[ 4] = v })
	property(mat4c, 'e22', function() { return this[ 5] }, function(v) { this[ 5] = v })
	property(mat4c, 'e32', function() { return this[ 6] }, function(v) { this[ 6] = v })
	property(mat4c, 'e42', function() { return this[ 7] }, function(v) { this[ 7] = v })
	property(mat4c, 'e13', function() { return this[ 8] }, function(v) { this[ 8] = v })
	property(mat4c, 'e23', function() { return this[ 9] }, function(v) { this[ 9] = v })
	property(mat4c, 'e33', function() { return this[10] }, function(v) { this[10] = v })
	property(mat4c, 'e43', function() { return this[11] }, function(v) { this[11] = v })
	property(mat4c, 'e14', function() { return this[12] }, function(v) { this[12] = v })
	property(mat4c, 'e24', function() { return this[13] }, function(v) { this[13] = v })
	property(mat4c, 'e34', function() { return this[14] }, function(v) { this[14] = v })
	property(mat4c, 'e44', function() { return this[15] }, function(v) { this[15] = v })

	let mat4 = function(elements) { return new mat4c(elements) }

	mat4.mul = function mul(a, b, out) {

		let a11 = a[ 0]
		let a21 = a[ 1]
		let a31 = a[ 2]
		let a41 = a[ 3]
		let a12 = a[ 4]
		let a22 = a[ 5]
		let a32 = a[ 6]
		let a42 = a[ 7]
		let a13 = a[ 8]
		let a23 = a[ 9]
		let a33 = a[10]
		let a43 = a[11]
		let a14 = a[12]
		let a24 = a[13]
		let a34 = a[14]
		let a44 = a[15]

		let b11 = b[ 0]
		let b21 = b[ 1]
		let b31 = b[ 2]
		let b41 = b[ 3]
		let b12 = b[ 4]
		let b22 = b[ 5]
		let b32 = b[ 6]
		let b42 = b[ 7]
		let b13 = b[ 8]
		let b23 = b[ 9]
		let b33 = b[10]
		let b43 = b[11]
		let b14 = b[12]
		let b24 = b[13]
		let b34 = b[14]
		let b44 = b[15]

		out[ 0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41
		out[ 4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42
		out[ 8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43
		out[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44
		out[ 1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41
		out[ 5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42
		out[ 9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43
		out[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44
		out[ 2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41
		out[ 6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42
		out[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43
		out[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44
		out[ 3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41
		out[ 7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42
		out[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43
		out[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44

		return out
	}

	return mat4

}

let mat4_ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
mat4    = mat4_type(Array, mat4_ident)
mat4f32 = mat4_type(f32arr, [mat4_ident])


// quaternion ----------------------------------------------------------------

let quatc = class q extends Array {

	constructor(x, y, z, w) {
		super(x || 0, y || 0, z || 0, or(w, 1))
	}

	set(x, y, z, w) {
		if (isarray(x)) {
			let v = x
			x = v[0]
			y = v[1]
			z = v[2]
			w = v[3]
		}
		this[0] = x
		this[1] = y
		this[2] = z
		this[3] = or(w, 1)
		return this
	}

	assign(q) {
		assert(q.is_quat)
		return assign(this, q)
	}

	reset() {
		return this.set(0, 0, 0, 1)
	}

	clone() {
		return quat().set(this[0], this[1], this[2], this[3])
	}

	equals(q) {
		return (
			q[0] === this[0] &&
			q[1] === this[1] &&
			q[2] === this[2] &&
			q[3] === this[3]
		)
	}

	from_array(a, i) {
		this[0] = a[i  ]
		this[1] = a[i+1]
		this[2] = a[i+2]
		this[3] = a[i+3]
		return this
	}

	to_array(a, i) {
		a[i  ] = this[0]
		a[i+1] = this[1]
		a[i+2] = this[2]
		a[i+3] = this[3]
		return a
	}

	// http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm
	// assumes axis is normalized
	set_from_axis_angle(axis, angle) {
		let s = sin(angle / 2)
		this[0] = axis[0] * s
		this[1] = axis[1] * s
		this[2] = axis[2] * s
		this[3] = cos(angle / 2)
		return this
	}

	// http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm
	// assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)
	set_from_rotation_matrix(m) {
		let m11 = m[ 0]
		let m21 = m[ 1]
		let m31 = m[ 2]
		let m12 = m[ 4]
		let m22 = m[ 5]
		let m32 = m[ 6]
		let m13 = m[ 8]
		let m23 = m[ 9]
		let m33 = m[10]
		let trace = m11 + m22 + m33
		if (trace > 0) {
			let s = 0.5 / sqrt(trace + 1.0)
			this[2] = 0.25 / s
			this[0] = (m32 - m23) * s
			this[1] = (m13 - m31) * s
			this[2] = (m21 - m12) * s
		} else if (m11 > m22 && m11 > m33) {
			let s = 2.0 * sqrt(1.0 + m11 - m22 - m33)
			this[2] = (m32 - m23) / s
			this[0] = 0.25 * s
			this[1] = (m12 + m21) / s
			this[2] = (m13 + m31) / s
		} else if (m22 > m33) {
			let s = 2.0 * sqrt(1.0 + m22 - m11 - m33)
			this[2] = (m13 - m31) / s
			this[0] = (m12 + m21) / s
			this[1] = 0.25 * _s2
			this[2] = (m23 + m32) / s
		} else {
			let s = 2.0 * sqrt(1.0 + m33 - m11 - m22)
			this[2] = (m21 - m12) / s
			this[0] = (m13 + m31) / s
			this[1] = (m23 + m32) / s
			this[2] = 0.25 * s
		}
		return this
	}

	// assumes direction vectors are normalized.
	set_from_unit_vectors(from, to) {
		let EPS = 0.000001
		let r = from.dot(to) + 1
		if (r < EPS) {
			r = 0
			if (abs(from[0]) > abs(from[2])) {
				this[0] = -from[1]
				this[1] =  from[0]
				this[2] =  0
			} else {
				this[0] =  0
				this[1] = -from[2]
				this[2] =  from[1]
			}
		} else {
			v3.cross(from, to, this)
		}
		this[3] = r
		return this.normalize()
	}

	rotate_towards(q, step) {
		let angle = this.angle_to(q)
		if (angle === 0) return this
		let t = min(1, step / angle)
		this.slerp(q, t)
		return this
	}

	conjugate() {
		this[0] *= -1
		this[1] *= -1
		this[2] *= -1
		return this
	}

	// quaternion is assumed to have unit length.
	invert() {
		return this.conjugate()
	}

	len2() {
		return (
			this[0] ** 2 +
			this[1] ** 2 +
			this[2] ** 2 +
			this[3] ** 2
		)
	}

	len() {
		return sqrt(this.len2())
	}

	normalize() {
		let l = this.len()
		if (l === 0) {
			this.reset()
		} else {
			l = 1 / l
			this[0] *= l
			this[1] *= l
			this[2] *= l
			this[3] *= l
		}
		return this
	}

	angle_to(q) {
		return 2 * acos(abs(clamp(this.dot(q), -1, 1)))
	}

	dot(v) {
		return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w
	}

	mul(q, p) {
		return quat.mul(this, q, this)
	}

	premul(q) {
		return quat.mul(q, this, this)
	}

	// http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/
	slerp(qb, t) {
		if (t === 0) return this
		if (t === 1) return this.set(qb)
		let x = this.x
		let y = this.y
		let z = this.z
		let w = this.w

		let cos_half_angle = w * qb.w + x * qb.x + y * qb.y + z * qb.z

		if (cos_half_angle < 0) {
			this.w = -qb.w
			this.x = -qb.x
			this.y = -qb.y
			this.z = -qb.z
			cos_half_angle = -cos_half_angle
		} else {
			this.set(qb)
		}

		if (cos_half_angle >= 1.0) {
			this.w = w
			this.x = x
			this.y = y
			this.z = z
			return this
		}

		let sqr_sin_half_angle = 1.0 - cos_half_angle * cos_half_angle

		if (sqr_sin_half_angle <= Number.EPSILON) {
			let s = 1 - t
			this.w = s * w + t * this.w
			this.x = s * x + t * this.x
			this.y = s * y + t * this.y
			this.z = s * z + t * this.z
			this.normalize()
			return this
		}

		let sin_half_angle = sqrt(sqr_sin_half_angle)
		let half_angle = atan2(sin_half_angle, cos_half_angle)
		let r1 = sin((1 - t) * half_angle) / sin_half_angle
		let r2 = sin(t * half_angle) / sin_half_angle
		this.w = w * r1 + this.w * r2
		this.x = x * r1 + this.x * r2
		this.y = y * r1 + this.y * r2
		this.z = z * r1 + this.z * r2

		return this
	}
}

quatc.prototype.is_quat = true

property(quatc, 'x', function() { return this[0] }, function(v) { this[0] = v })
property(quatc, 'y', function() { return this[1] }, function(v) { this[1] = v })
property(quatc, 'z', function() { return this[2] }, function(v) { this[2] = v })
property(quatc, 'w', function() { return this[3] }, function(v) { this[3] = v })

quat = function(x, y, z, w) { return new quatc(x, y, z, w) }

// from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm
quat.mul = function mul(a, b, out) {
	let qax = a[0]
	let qay = a[1]
	let qaz = a[2]
	let qaw = a[3]
	let qbx = b[0]
	let qby = b[1]
	let qbz = b[2]
	let qbw = b[3]
	out[0] = qax * qbw + qaw * qbx + qay * qbz - qaz * qby
	out[1] = qay * qbw + qaw * qby + qaz * qbx - qax * qbz
	out[2] = qaz * qbw + qaw * qbz + qax * qby - qay * qbx
	out[3] = qaw * qbw - qax * qbx - qay * qby - qaz * qbz
	return out
}

// plane ---------------------------------------------------------------------

let _m3_1 = mat3()

let planec = class plane {

	constructor(normal, constant) {
		this.normal = normal || v3(1, 0, 0)
		this.constant = constant || 0
	}

	set(normal, constant) {
		if (normal.is_plane) {
			let pl = normal
			this.normal.set(pl.normal)
			this.constant = pl.constant
		} else {
			this.normal.set(normal)
			this.constant = constant
		}
		return this
	}

	assign(p) {
		assert(p.is_plane)
		assign(this, p)
		p.normal = p.normal.clone()
	}

	clone() {
		return new plane(this.normal, this.constant)
	}

	equals(pl) {
		return pl.normal.equals(this.normal) && pl.constant === this.constant
	}

	set_from_normal_and_coplanar_point(normal, p) {
		this.normal.set(normal)
		this.constant = -p.dot(this.normal)
		return this
	}

	set_from_coplanar_points(a, b, c) {
		let normal = _v1.set(c).sub(b).cross(_v2.set(a).sub(b)).normalize()
		this.set_from_normal_and_coplanar_point(normal, a)
		return this
	}

	// Newell's method.
	set_from_poly(poly) {
		let n = poly.point_count()
		assert(n >= 3)
		let pn = _v1.set(0, 0, 0)
		let p1 = poly.get_point(0, _v2)
		for (let i = 1; i <= n; i++) {
			let p2 = poly.get_point(i % n, _v3)
			pn[0] += (p1[1] - p2[1]) * (p1[2] + p2[2])
			pn[1] += (p1[2] - p2[2]) * (p1[0] + p2[0])
			pn[2] += (p1[0] - p2[0]) * (p1[1] + p2[1])
			p1.set(p2)
		}
		pn.normalize()
		return this.set_from_normal_and_coplanar_point(pn, p1)
	}

	normalize() {
		// Note: will lead to a divide by zero if the plane is invalid.
		let inv_len = 1.0 / this.normal.len()
		this.normal.muls(inv_len)
		this.constant *= inv_len
		return this
	}

	negate() {
		this.constant *= -1
		this.normal.negate()
		return this
	}

	distance_to_point(p) {
		return this.normal.dot(p) + this.constant
	}

	distance_to_sphere(sphere) {
		return this.distance_to_point(sphere.center) - sphere.radius
	}

	project_point(p, out) {
		return out.set(this.normal).muls(-this.distance_to_point(p)).add(p)
	}

	intersect_line(line, strict, out) {
		let direction = line.delta(_v1)
		let denominator = this.normal.dot(direction)
		if (denominator == 0)
			return // line is on the plane
		let t = -(line.start.dot(this.normal) + this.constant) / denominator
		let p = out.set(direction).muls(t).add(line.start)
		if (strict && (t < 0 || t > 1))
			return
		p.t = t
		return p
	}

	// Note: this tests if a line intersects the plane, not whether it
	// (or its end-points) are coplanar with it.
	intersects_line(line) {
		let d1 = this.distance_to_point(line.start)
		let d2 = this.distance_to_point(line.end)
		return d1 < 0 && d2 > 0 || d2 < 0 && d1 > 0
	}

	intersects_box(box) {
		return box.intersects_plane(this)
	}

	intersects_sphere(sphere) {
		return sphere.intersects_plane(this)
	}

	coplanar_point(out) {
		return out.set(this.normal).muls(-this.constant)
	}

	transform(m, normal_mat) {
		normal_mat = normal_mat || _m3_1.get_normal_matrix(m)
		let ref_point = this.coplanar_point(_v1).transform(m)
		let normal = this.normal.transform(normal_mat).normalize()
		this.constant = -ref_point.dot(normal)
		return this
	}

	translate(offset) {
		this.constant -= offset.dot(this.normal)
		return this
	}

}

planec.prototype.is_plane = true

plane = function(normal, constant) { return new planec(normal, constant) }

// triangle3 -----------------------------------------------------------------

let tri3c = class triangle3 extends Array {

	constructor(a, b, c) {
		super(a || v3(), b || v3(), c || v3())
	}

	set(a, b, c) {
		if (isarray(a)) {
			let t = a
			this[0].set(t[0])
			this[1].set(t[1])
			this[2].set(t[2])
		} else {
			this[0].set(a)
			this[1].set(b)
			this[2].set(c)
		}
		return this
	}

	assign(t) {
		assert(t.is_triangle)
		assign(this, t)
		this[0] = this[0].clone()
		this[1] = this[1].clone()
		this[2] = this[2].clone()
	}

	clone() {
		return new triangle3().set(this)
	}

	equals(t) {
		return (
			t[0].equals(this[0]) &&
			t[1].equals(this[1]) &&
			t[2].equals(this[2])
		)
	}

	set_from_points_and_indices(points, i0, i1, i2) {
		this[0].set(points[i0])
		this[1].set(points[i1])
		this[2].set(points[i2])
		return this
	}

	area() {
		_v0.set(this[2]).sub(this[1])
		_v1.set(this[0]).sub(this[1])
		return _v0.cross(_v1).len() * 0.5
	}

	midpoint(out) {
		return out.set(this[0]).add(this[1]).add(this[2]).muls(1 / 3)
	}

	normal(out) {
		return tri3.normal(this[0], this[1], this[2], out)
	}

	plane(out) {
		return out.set_from_coplanar_points(this[0], this[1], this[2])
	}

	barycoord(p, out) {
		return tri3.barycoord(p, this[0], this[1], this[2], out)
	}

	uv(p, uv1, uv2, uv3, out) {
		return tri3.uv(p, this[0], this[1], this[2], uv1, uv2, uv3, out)
	}

	contains_point(p) {
		return tri3.contains_point(p, this[0], this[1], this[2])
	}

	is_front_facing(direction) {
		return tri3.is_front_facing(this[0], this[1], this[2], direction)
	}

	intersects_box(box) {
		return box.intersects_box(this)
	}

}

tri3c.prototype.is_triangle3 = true

triangle3 = function(a, b, c) { return new tri3c(a, b, c) }

triangle3.normal = function normal(a, b, c, out) {
	out.set(c).sub(b)
	_v0.set(a).sub(b)
	out.cross(_v0)
	let out_len2 = out.len2()
	if (out_len2 > 0)
		return out.muls(1 / sqrt(out_len2))
	return out.set(0, 0, 0)
}

// static/instance method to calculate barycentric coordinates
// http://www.blackpawn.com/texts/pointinpoly/default.html
triangle3.barycoord = function barycoord(p, a, b, c, out) {
	_v0.set(c).sub(a)
	_v1.set(b).sub(a)
	_v2.set(p).sub(a)
	let dot00 = _v0.dot(_v0)
	let dot01 = _v0.dot(_v1)
	let dot02 = _v0.dot(_v2)
	let dot11 = _v1.dot(_v1)
	let dot12 = _v1.dot(_v2)
	let denom = dot00 * dot11 - dot01 * dot01
	if (denom == 0)
		return
	let inv_denom = 1 / denom
	let u = (dot11 * dot02 - dot01 * dot12) * inv_denom
	let v = (dot00 * dot12 - dot01 * dot02) * inv_denom // barycentric coordinates must always sum to 1
	return out.set(1 - u - v, v, u)
}

triangle3.contains_point = function contains_point(p, a, b, c) {
	this.barycoord(p, a, b, c, _v3)
	return _v3.x >= 0 && _v3.y >= 0 && _v3.x + _v3.y <= 1
}

triangle3.uv = function uv(p, p1, p2, p3, uv1, uv2, uv3, out) {
	this.barycoord(p, p1, p2, p3, _v3)
	out.set(0, 0)
	out.add(uv1, _v3.x)
	out.add(uv2, _v3.y)
	out.add(uv3, _v3.z)
	return out
}

triangle3.is_front_facing = function is_front_facing(a, b, c, direction) {
	_v0.set(c).sub(b)
	_v1.set(a).sub(b) // strictly front facing
	return _v0.cross(_v1).dot(direction) < 0
}

// box3 ----------------------------------------------------------------------

let box3_class = function(min, max) {
	this.min = min || v3(+Infinity, +Infinity, +Infinity)
	this.max = max || v3(-Infinity, -Infinity, -Infinity)
}
let box3p = box3_class.prototype
box3 = function(min, max) { return new box3_class(min, max) }
box3p.is_box3 = true

box3p.set = function set(min, max) {
	if (min.is_box3) {
		let box = min
		this.min.copy(box.min)
		this.max.copy(box.max)
	} else {
		this.min.copy(min)
		this.max.copy(max)
	}
	return this
}

box3p.clone = function clone() {
	return new box3().set(this)
}

box3p.equals = function equals(box) {
	return (
		box.min.equals(this.min) &&
		box.max.equals(this.max)
	)
}

box3p.reset = function reset() {
	this.min.x = this.min.y = this.min.z = +Infinity
	this.max.x = this.max.y = this.max.z = -Infinity
	return this
}

box3p.is_empty = function is_empty() {
	// this is a more robust check for empty than ( volume <= 0 ) because volume can get positive with two negative axes
	return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z
}

box3p.center = function center(out) {
	return this.is_empty() ? out.set(0, 0, 0) : out.set(this.min).add(this.max).muls(0.5)
}

box3p.size = function size(out) {
	return this.is_empty() ? out.set(0, 0, 0) : out.set(this.max).sub(this.min)
}

box3p.expand_by_point = function expand_by_point(p) {
	this.min.min(p)
	this.max.max(p)
	return this
}

box3p.expand_by_vector = function expand_by_vector(v) {
	this.min.sub(v)
	this.max.add(v)
	return this
}

box3p.expand_by_scalar = function expand_by_scalar(s) {
	this.min.adds(-s)
	this.max.adds(s)
	return this
}

box3p.expand_by_object = function expand_by_object(object) {
	// Computes the world-axis-aligned bounding box of an object (including its children),
	// accounting for both the object's, and children's, world transforms
	object.updateWorldMatrix(false, false)
	let geometry = object.geometry

	if (geometry !== undefined) {
		if (geometry.boundingBox === null) {
			geometry.computeBoundingBox()
		}

		_box.copy(geometry.boundingBox)

		_box.applyMatrix4(object.matrixWorld)

		this.union(_box)
	}

	let children = object.children

	for (let i = 0, l = children.length; i < l; i++) {
		this.expandByObject(children[i])
	}

	return this
}

box3p.containsPoint = function containsPoint(point) {
	return point.x < this.min.x || point.x > this.max.x || point.y < this.min.y || point.y > this.max.y || point.z < this.min.z || point.z > this.max.z ? false : true
}

box3p.containsBox = function containsBox(box) {
	return this.min.x <= box.min.x && box.max.x <= this.max.x && this.min.y <= box.min.y && box.max.y <= this.max.y && this.min.z <= box.min.z && box.max.z <= this.max.z
}

box3p.getParameter = function getParameter(point, target) {
	// This can potentially have a divide by zero if the box
	// has a size dimension of 0.
	if (target === undefined) {
		console.warn('THREE.Box3: .getParameter() target is now required')
		target = new Vector3()
	}

	return target.set((point.x - this.min.x) / (this.max.x - this.min.x), (point.y - this.min.y) / (this.max.y - this.min.y), (point.z - this.min.z) / (this.max.z - this.min.z))
}

box3p.intersectsBox = function intersectsBox(box) {
	// using 6 splitting planes to rule out intersections.
	return box.max.x < this.min.x || box.min.x > this.max.x || box.max.y < this.min.y || box.min.y > this.max.y || box.max.z < this.min.z || box.min.z > this.max.z ? false : true
}

box3p.intersectsSphere = function intersectsSphere(sphere) {
	// Find the point on the AABB closest to the sphere center.
	this.clampPoint(sphere.center, _vector$1) // If that point is inside the sphere, the AABB and sphere intersect.

	return _vector$1.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius
}

box3p.intersectsPlane = function intersectsPlane(pl) {
	// We compute the minimum and maximum dot product values. If those values
	// are on the same side (back or front) of the plane, then there is no intersection.
	let min, max

	if (pl.normal.x > 0) {
		min = pl.normal.x * this.min.x
		max = pl.normal.x * this.max.x
	} else {
		min = pl.normal.x * this.max.x
		max = pl.normal.x * this.min.x
	}

	if (pl.normal.y > 0) {
		min += pl.normal.y * this.min.y
		max += pl.normal.y * this.max.y
	} else {
		min += pl.normal.y * this.max.y
		max += pl.normal.y * this.min.y
	}

	if (pl.normal.z > 0) {
		min += pl.normal.z * this.min.z
		max += pl.normal.z * this.max.z
	} else {
		min += pl.normal.z * this.max.z
		max += pl.normal.z * this.min.z
	}

	return min <= -pl.constant && max >= -pl.constant
}

box3p.intersectsTriangle = function intersectsTriangle(triangle) {
	if (this.isEmpty()) {
		return false
	} // compute box center and extents
	this.getCenter(_center)
	v3.sub(_extents, this.max, _center)
	_extents.subVectors(this.max, _center) // translate triangle to aabb origin
	_v0.subVectors(triangle.a, _center)
	_v1.subVectors(triangle.b, _center)
	_v2.subVectors(triangle.c, _center) // compute edge vectors for triangle
	_f0.subVectors(_v1, _v0)
	_f1.subVectors(_v2, _v1)
	_f2.subVectors(_v0, _v2)
	// test against axes that are given by cross product combinations of the edges of the triangle and the edges of the aabb
	// make an axis testing of each of the 3 sides of the aabb against each of the 3 sides of the triangle = 9 axis of separation
	// axis_ij = u_i x f_j (u0, u1, u2 = face normals of aabb = x,y,z axes vectors since aabb is axis aligned)

	let axes = [0, -_f0.z, _f0.y, 0, -_f1.z, _f1.y, 0, -_f2.z, _f2.y, _f0.z, 0, -_f0.x, _f1.z, 0, -_f1.x, _f2.z, 0, -_f2.x, -_f0.y, _f0.x, 0, -_f1.y, _f1.x, 0, -_f2.y, _f2.x, 0]

	if (!satForAxes(axes, _v0, _v1, _v2, _extents)) {
		return false
	} // test 3 face normals from the aabb

	axes = [1, 0, 0, 0, 1, 0, 0, 0, 1]

	if (!satForAxes(axes, _v0, _v1, _v2, _extents)) {
		return false
	}
	// finally testing the face normal of the triangle
	// use already existing triangle edge vectors here

	_triangleNormal.crossVectors(_f0, _f1)

	axes = [_triangleNormal.x, _triangleNormal.y, _triangleNormal.z]
	return satForAxes(axes, _v0, _v1, _v2, _extents)
}

box3p.clampPoint = function clampPoint(point, target) {
	if (target === undefined) {
		console.warn('THREE.Box3: .clampPoint() target is now required')
		target = new Vector3()
	}

	return target.copy(point).clamp(this.min, this.max)
}

box3p.distanceToPoint = function distanceToPoint(point) {
	let clampedPoint = _vector$1.copy(point).clamp(this.min, this.max)
	return clampedPoint.sub(point).len()
}

box3p.getBoundingSphere = function getBoundingSphere(target) {
	this.getCenter(target.center)
	target.radius = this.getSize(_vector$1).len() * 0.5
	return target
}

box3p.intersect = function intersect(box) {
	this.min.max(box.min)
	this.max.min(box.max) // ensure that if there is no overlap, the result is fully empty, not slightly empty with non-inf/+inf values that will cause subsequence intersects to erroneously return valid values.

	if (this.isEmpty()) this.makeEmpty()
	return this
}

box3p.union = function union(box) {
	this.min.min(box.min)
	this.max.max(box.max)
	return this
}

box3p.applyMatrix4 = function applyMatrix4(matrix) {
	// transform of empty box is an empty box.
	if (this.isEmpty()) return this // NOTE: I am using a binary pattern to specify all 2^3 combinations below
	_points[0].set(this.min.x, this.min.y, this.min.z).applyMatrix4(matrix) // 000
	_points[1].set(this.min.x, this.min.y, this.max.z).applyMatrix4(matrix) // 001
	_points[2].set(this.min.x, this.max.y, this.min.z).applyMatrix4(matrix) // 010
	_points[3].set(this.min.x, this.max.y, this.max.z).applyMatrix4(matrix) // 011
	_points[4].set(this.max.x, this.min.y, this.min.z).applyMatrix4(matrix) // 100
	_points[5].set(this.max.x, this.min.y, this.max.z).applyMatrix4(matrix) // 101
	_points[6].set(this.max.x, this.max.y, this.min.z).applyMatrix4(matrix) // 110
	_points[7].set(this.max.x, this.max.y, this.max.z).applyMatrix4(matrix) // 111
	this.setFromPoints(_points)
	return this
}

box3p.translate = function translate(offset) {
	this.min.add(offset)
	this.max.add(offset)
	return this
}

// color3 --------------------------------------------------------------------

function color3(s) {
	return [(s >> 16) & 0xff, (s >> 8) & 0xff, s && 0xff]
}

function color4(s) {
	return [(s >> 24) & 0xff, (s >> 16) & 0xff, (s >> 8) & 0xff, s && 0xff]
}

// box2 ----------------------------------------------------------------------

box2 = function() {
	let b = [1/0, 1/0, -1/0, -1/0]
	b.is_box2 = true
	return b
}

box2.add_point = function(x, y) {
	this[0] = min(this[0], x)
	this[1] = min(this[1], y)
	this[2] = max(this[2], x)
	this[3] = max(this[3], y)
}

// poly3 ---------------------------------------------------------------------

let poly3c = class poly3 extends Array {

	constructor(opt, elements) {
		if (elements)
			super(...elements)
		else
			super()
		assign(this, opt)
	}

	assign(poly) {
		assign(this, poly)
	}

}

let poly3p = poly3c.prototype

poly3p.is_poly3 = true

poly3 = function(opt, elements) { return new poly3c(opt, elements) }

poly3.class = poly3c

poly3.subclass = function(methods) {
	let cls = class poly3sub extends Array {
		// copy-paste the constructor because these are not first-class values
		// so we can't access the one from poly3c... stupid.
		constructor(opt, elements) {
			if (elements)
				super(...elements)
			else
				super()
			assign(this, opt)
		}
	}
	assign(cls.prototype, poly3c.prototype, methods) // static inheritance (keep lookup chain short).
	let cons = function(opt, elements) { return new cls(opt, elements) }
	cons.class = cls
	return cons
}

// accessor stubs. replace in subclasses based on how the points are stored.
poly3p.point_count = function point_count() { return this.length }
poly3p.get_point = function(i) { return this[i] }

poly3p.plane = function() {
	if (!this._plane) {
		this._plane = plane()
		this._plane.set_from_poly(this)
	}
	return this._plane
}

// project on the xy plane for triangulation which happens in 2D.
let xy_normal = v3(0, 0, 1)
poly3p.project_xy = function() {
	if (!this._project_xy) {
		let xy_quat = quat().set_from_unit_vectors(this.plane().normal, xy_normal)
		let pp = new this.__proto__.constructor(this)
		let point_count = this.point_count
		let get_point = this.get_point
		pp.get_point = function(i, _p) {
			let p = get_point.call(this, i, _p)
			p.transform(xy_quat)
			return p
		}
		this._project_xy = pp
	}
	return this._project_xy
}

// check if a polygon is a convex quad (the most common case for trivial triangulation).
{
	let a = v3()
	let c = v3()
	let v = v3()
	let m = mat3()
	let cross_sign = function(_a, _b, _c) {
		v3.sub(_a, _b, a)
		v3.sub(_c, _b, c)
		v3.cross(a, c, v)
		// compute the signed volume between ab, cb and ab x cb.
		// the sign tells you the direction of the cross vector.
		m.set(
			v.x, a.x, c.x,
			v.y, a.y, c.y,
			v.z, a.z, c.z
		)
		return sign(m.det())
	}

	let p0 = v3()
	let p1 = v3()
	let p2 = v3()
	let p3 = v3()
	poly3p.is_convex_quad = function is_convex_quad(EPSILON) {
		if (this.point_count() != 4)
			return false
		this.get_point(0, p0)
		this.get_point(1, p1)
		this.get_point(2, p2)
		this.get_point(3, p3)
		let s0 = cross_sign(p0, p1, p2)
		let s1 = cross_sign(p1, p2, p3)
		let s2 = cross_sign(p2, p3, p0)
		let s3 = cross_sign(p3, p0, p1)
		let sr = abs(s0) >= EPSILON ? s0 : s1 // one (and only one) of them can be zero.
		return (
			   (s0 == 0 || s0 == sr)
			&& (s1 == 0 || s1 == sr)
			&& (s2 == 0 || s2 == sr)
			&& (s3 == 0 || s3 == sr)
		)
	}
}

{
	let ps = []
	poly3p.triangulate = function(out, EPSILON) {
		let pn = this.point_count()
		if (pn == 3) { // triangle: nothing to do, push points directly.
			out.push(0, 1, 2)
		} else if (pn == 4 && this.is_convex_quad(EPSILON)) { // convex quad: most common case.
			out.push(2, 3, 0, 0, 1, 2)
		} else {
			ps.length = pn * 2
			let pp = this.project_xy()
			for (let i = 0; i < pn; i++) {
				let p = pp.get_point(i)
				ps[2*i+0] = p.x
				ps[2*i+1] = p.y
			}
			let tri_pis = earcut2(ps, null, 2)
			assert(tri_pis.length == 3 * (pn - 2))
			out.extend(tri_pis)
		}
		return out
	}
}

// (tu, tv) are 1 / (texture's (u, v) in world space).
{
	let _p0 = v3()
	let _p1 = v3()
	let p = v2()
	poly3p.uv_at = function(i, uvm, tex_uv) {
		let pp = this.project_xy()
		let p0 = pp.get_point(0, _p0)
		let pi = pp.get_point(i, _p1)
		pi.sub(p0)
		p[0] = pi[0] * tex_uv[0]
		p[1] = pi[1] * tex_uv[1]
		let px = p.x
		let py = p.y
		p.transform(uvm)
		return p
	}
}

poly3p.invalidate = function() {
	this._plane = null
	this._project_xy = null
}

// line3 ---------------------------------------------------------------------

let line3c = class line3 extends Array {

	constructor(p0, p1) {
		super(p0 || v3(), p1 || v3())
	}

	set(p0, p1) {
		this[0].copy(p0)
		this[1].copy(p1)
		return this
	}

	clone() {
		let line = new line3()
		return line.set(this[0], this[1])
	}

	equals(line) {
		return (
			line[0].equals(this[0]) &&
			line[1].equals(this[1])
		)
	}

	center(out) {
		return v3.add(this[0], this[1], out).muls(0.5)
	}

	delta(out) {
		return v3.sub(this[0], this[1], out)
	}

	distance2() {
		return this[0].distance2(this[1])
	}

	distance() {
		return this[0].distance2(this[1])
	}

	at(t, out) {
		return this.delta(out).muls(t).add(this[0])
	}

	closest_point_to_point_t(p, clamp_to_line) {
		let p0 = v3.sub(p, this[0], _v0)
		let p1 = v3.sub(this[1], this[0], _v1)
		let t = p1.dot(p0) / p1.dot(p1)
		if (clamp_to_line)
			t = clamp(t, 0, 1)
		return t
	}

	closest_point_to_point(p, clamp_to_line, out) {
		let t = this.closest_point_to_point_t(p, clamp_to_line)
		return this.delta(out).muls(t).add(this[0])
	}

	apply_mat4(m) {
		this[0].applyMatrix4(m)
		this[1].applyMatrix4(m)
		return this
	}

}

line3c.prototype.is_line3 = true

line3 = function(p1, p2) { return new line3c(p1, p2) }

} // module scope.

