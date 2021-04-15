/*

	3D model editor widget.
	Written by Cosmin Apreutesei. Public domain.

*/

DEBUG = 0

component('x-modeleditor', function(e) {

	let pe = e

	// colors ------------------------------------------------------------------

	let white = 0xffffff
	let black = 0x000000
	let selected_color = 0x0000ff
	let ref_color = 0xff00ff
	let x_axis_color = 0x990000
	let y_axis_color = 0x000099
	let z_axis_color = 0x006600

	// canvas & webgl context -------------------------------------------------

	let canvas = tag('canvas')
	focusable_widget(e, canvas)
	canvas.attr('tabindex', -1)
	e.add(canvas)

	let gl = assert(canvas.getContext('webgl2'))
	//gl.wrap_calls()

	// camera -----------------------------------------------------------------

	let camera = camera3()
	let min_distance = 0.001  // min line distance
	let max_distance = 1e4    // max model total distance

	function update_camera_proj() {
		camera.view_size.set(canvas.width, canvas.height)
		if (e.projection == 'ortho') {
			camera.ortho(-10, 10, -10, 10, -1e2, 1e2)
		} else {
			camera.fov  = e.fov
			camera.near = min_distance * 100
			camera.far  = max_distance * 100
			camera.perspective()
		}
		update_camera()
	}

	e.set_ortho = function(v) { update_camera_proj() }
	e.set_fov   = function(v) { update_camera_proj() }
	e.set_camera_pos = function(v) { camera.pos.set(v); update_camera() }
	e.set_camera_dir = function(v) { camera.dir.set(v); update_camera() }
	e.set_camera_up  = function(v) { camera .up.set(v); update_camera() }

	e.prop('projection' , {store: 'var', type: 'enum'  , enum_values: ['perspective', 'ortho'], default: 'perspective'})
	e.prop('fov'        , {store: 'var', type: 'number', default: 60})
	e.prop('camera_pos' , {store: 'var', type: 'v3', default: camera.pos})
	e.prop('camera_dir' , {store: 'var', type: 'v3', default: camera.dir})
	e.prop('camera_up'  , {store: 'var', type: 'v3', default: camera.up })

	function update_camera() {
		camera.update()
		fire_pointermove()
		skybox.update_view(camera.pos)
		update_dot_positions()
		update_sunlight_pos()
		update_renderer()
	}

	// shadows ----------------------------------------------------------------

	e.set_shadows = function(v) { renderer.enable_shadows = v; update_renderer() }

	e.prop('shadows', {store: 'var', type: 'boolean', default: false})

	// sun position -----------------------------------------------------------

	e.set_sunlight  = function(v) { update_sunlight_pos(); update_renderer() }
	e.set_time      = function(v) { update_sun_pos(); update_renderer() }
	e.set_north     = function(v) { update_sun_pos(); update_renderer() }
	e.set_latitude  = function(v) { update_sun_pos(); update_renderer() }
	e.set_longitude = function(v) { update_sun_pos(); update_renderer() }

	e.prop('sunlight'   , {store: 'var', type: 'boolean', default: false})
	e.prop('time'       , {store: 'var', type: 'datetime', default: 1596272400})
	e.prop('north'      , {store: 'var', type: 'number', default: 0})
	e.prop('latitude'   , {store: 'var', type: 'number', default: 44.42314})
	e.prop('longitude'  , {store: 'var', type: 'number', default: 26.35673})

	let sun_dir = v3()
	function update_sun_pos() {
		let {azimuth, altitude} = suncalc.sun_position(e.time, e.latitude, e.longitude)
		sun_dir.set(v3.z_axis)
			.rotate(v3.x_axis, -altitude)
			.rotate(v3.y_axis, -azimuth + rad * e.north)
		update_sunlight_pos()
	}

	function update_sunlight_pos() {
		if (e.sunlight || e.shadows) {
			renderer.sunlight_dir.set(sun_dir)
		} else {
			renderer.sunlight_dir.set(camera.dir)
		}
	}

	// rendering --------------------------------------------------------------

	function draw(prog) {
		if (DEBUG)
			gl.start_trace()
		let t0 = time()
		skybox.draw(prog)
		//ground_rr.draw(prog)
		draw_model(prog)
		if (DEBUG)
			print(gl.stop_trace())
		helper_lines_rr.draw(prog)
	}

	let renderer

	function init_renderer() {
		renderer = gl.scene_renderer({
			enable_shadows: e.shadows,
			camera: camera,
		})
	}

	let raf_id
	function do_render() {
		renderer.render(draw)
		raf_id = null
	}

	function render() {
		if (!raf_id)
			raf_id = raf(do_render)
		mouse.valid = false
	}

	function update_renderer() {
		renderer.update()
		render()
	}

	e.detect_resize()

	e.on('resize', function(r) {
		canvas.width = r.w
		canvas.height = r.h
		update_camera_proj()
	})

	// undo/redo stacks -------------------------------------------------------

	let undo_groups = [] // [i1, ...] indices in undo_stack where groups start
	let undo_stack  = [] // [args1...,argc1,f1, ...]
	let redo_groups = [] // same
	let redo_stack  = [] // same

	function start_undo() {
		undo_groups.push(undo_stack.length)
	}

	function push_undo(f, ...args) {
		undo_stack.push(...args, args.length, f)
	}

	function undo_from(stack, start) {
		start_undo()
		while (stack.length >= start) {
			let f = stack.pop()
			let argc = stack.pop()
			f(...stack.splice(-argc))
		}
	}

	function undo() {
		let stack  = undo_stack
		let groups = undo_groups
		let start  = groups.pop()
		if (start == null)
			return
		undo_groups = redo_groups
		undo_stack  = redo_stack
		undo_from(stack, start)
		undo_groups = groups
		undo_stack  = stack
	}

	function redo() {
		undo_from(redo_stack, redo_groups.pop())
	}

	// materials --------------------------------------------------------------

	let materials = [] //[{diffuse_color:, diffuse_map:, uv: , opacity: , faces: [face1,...]},...]

	function add_material(opt) {
		let mat = assign({
			diffuse_color: 0xffffff,
			uv: v2(1, 1),
			opacity: 1,
		}, opt)
		mat.opacity = clamp(mat.opacity, 0, 1)
		materials.push(mat)
		return mat
	}

	let default_material = add_material({diffuse_color: 0xffffff})

	// layers -----------------------------------------------------------------

	let layers = []
	let next_layer_num = 0
	let default_layer

	function init_layers() {
		default_layer = add_layer({name: '<default>', can_hide: false})
	}

	function layer_changed(node, layer) {
		// TODO
	}

	function add_layer(opt) {
		layer = assign({name: 'layer '+(next_layer_num++), visible: true, can_hide: true}, opt)
		layers.push(layer)
		instances_valid = false
		return layer
	}

	function remove_layer(layer) {
		// TODO: move tbis layer's instances to the default layer.
		layers.remove_value(layer)
		instances_valid = false
	}

	function layer_set_visibile(layer, visible) {
		layer.visible = !!visible
		instances_valid = false
	}

	// components -------------------------------------------------------------

	let comps = [] // [comp1,...]

	function create_component(opt) {
		let comp = model3_component(assign(opt || {}, {
				gl               : gl,
				push_undo        : push_undo,
				default_material : default_material,
				default_layer    : default_layer,
				child_added      : child_added,
				child_removed    : child_removed,
				layer_changed    : layer_changed,
			}))
		let id = comps.length
		comps[id] = comp
		comp.id = id
		instances_valid = false
		return comp
	}

	function remove_component(comp) {
		comps.remove(comp.id)
		let id = 0
		for (let comp of comps)
			comp.id = id++
		instances_valid = false
	}

	// component instances ----------------------------------------------------

	// NOTE: child component objects are mat4's, that's ok, don't sweat it.

	let root
	let instances_valid

	function child_added(parent_comp, node) {
		instances_valid = false
	}

	function child_removed(parent_comp, node) {
		instances_valid = false
	}

	function child_changed(node) {
		//
		instances_valid = false
	}

	{
	let _m0 = mat4()
	let disabled_arr = [0]
	function update_instance_matrices_for(node, parent, path_depth, on_cur_path) {
		let davib = node.comp.davib
		let i = davib.len
		davib.len = i + 1
		_m0.set(node)
		if (parent)
			_m0.mul(parent)
		_m0.to_mat4_array(davib.dabs.model.array, i)
		disabled_arr[0] = !on_cur_path || cur_path.length-1 > path_depth
		davib.dabs.disabled.set(i, disabled_arr)

		node.parent = parent
		let children = node.comp.children
		if (children) {
			let cur_child = cur_path[path_depth + 1]
			for (let child of children)
				if (child.layer.visible) {
					update_instance_matrices_for(child, node,
							path_depth + 1,
							cur_child == null || cur_child == child
						)
				}
		}
	}}

	function update_instance_matrices() {

		if (instances_valid)
			return

		for (let comp of comps)
			if (comp.davib)
				comp.davib.len = 0
			else
				comp.davib = gl.dyn_arr_vertex_instance_buffer({model: 'mat4', disabled: 'i8'})

		update_instance_matrices_for(root, null, 0, true)

		for (let comp of comps)
			comp.davib.upload()

		instances_valid = true
	}

	function init_root() {
		e.root = create_component({name: '<root>'})
		root = mat4()
		root.comp = e.root
		cur_path.push(root)
	}

	function gc_components() {
		for (let [comp, insts] of instances) {
			if (!insts.length) {
				if (insts.dab)
					insts.dab.free()
				instances.delete(comp)
				remove_component(comp)
				comp.free()
			}
		}
	}

	// drawing

	function update_model() {
		update_instance_matrices()
		for (let comp of comps)
			comp.update(
				comp.davib.dabs.model.buffer,
				comp.davib.dabs.disabled.buffer)
	}

	function draw_model(prog) {
		update_model()
		for (let i = 0, n = comps[0] && comps[0].renderers.length || 0; i < n; i++)
			for (let comp of comps)
				comp.renderers[i].draw(prog)
		axes_rr.draw(prog)
	}

	function draw_model_for_hit_test(prog) {
		update_model()
		for (let comp of comps)
			comp.face_renderer.draw(prog)
	}


	// instance path finding for hit testing

	{
	let path = []
	function instance_path_for(target_comp, target_inst_id, node) {
		path.push(node)
		if (target_comp == node.comp && target_inst_id == target_comp._inst_id)
			return true
		node.comp._inst_id++
		for (let child of node.comp.children) {
			if (instance_path_for(target_comp, target_inst_id, child))
				return true
		}
		path.pop(node)
	}
	function instance_path(comp, inst_id) {
		for (let comp of comps)
			comp._inst_id = 0
		path.length = 0
		instance_path_for(comp, inst_id, root)
		return path
	}}

	// instance-space <-> world-space transforms

	function inst_model(comp, inst_id, out) {
		out.inst_id = inst_id
		return out.from_mat4_array(comp.davib.dabs.model.array, inst_id)
	}

	function inst_inv_model(comp, inst_id, out) {
		out.inst_id = inst_id
		return inst_model(comp, inst_id, out).invert()
	}

	// model-wide instance intersection tests

	{
	let _m0 = mat4()
	let _v0 = v3()
	function line_hit_lines(target_line, max_d, p2p_distance2, int_mode, is_line_valid, is_int_line_valid) {
		if (!max_d)
			return
		for (let comp of comps) {
			for (let i = 0, n = comp.davib.len; i < n; i++) {
				let model = inst_model(comp, i, _m0)
				let int_p = comp.line_hit_lines(model, target_line, max_d, p2p_distance2, int_mode, is_line_valid, is_int_line_valid, _v0)
				if (int_p) {
					int_p.comp = comp
					return int_p
				}
			}
		}
	}}

	// selection

	function select_all(selected) {
		for (let comp of comps)
			comp.select_all(selected)
	}

	// reference planes -------------------------------------------------------

	function ref_plane(
		name, normal, plane_hit_tooltip,
		main_axis_snap, main_axis, main_axis_snap_tooltip
	) {

		let plane = plane3(normal)

		{
		let _l0 = line3()
		e.mouse_hit_plane = function(model) {
			let ray = mouse.ray.to(_l0).transform(model)
			let angle = camera.dir.angle_to(normal)
			if (angle > PI / 2)
				angle = abs(angle - PI)
			p.angle = angle
			p.tooltip = plane_hit_tooltip
			return p
		}}

		{
		let _l1 = line3()
		let _l2 = line3()
		let _l3 = line3()
		e.mouse_hit_main_axis = function(model, max_hit_distance, out) {

			assert(out.is_v3)

			out.ds = 1/0
			out.line_snap = null
			out.tooltip = null

			let axis = _l1.set(v3.origin, main_axis).transform(model)
			let int_p = axis.closest_point_to_point(mouse, false, out)
			if (!int_p)
				return

			let ds = mouse.distance2(int_p)
			if (ds > max_hit_distance ** 2)
				return

			let ray = camera.raycast(int_p[0], int_p[1], _l2)
			let int_line = ray.intersect_line(axis, _l3)
			if (!int_line)
				return

			out.set(int_line[1])
			out.ds = ds
			out.line_snap = main_axis_snap
			out.tooltip = main_axis_snap_tooltip

		}}

		{
		let _p = v3()
		e.point_along_main_axis = function(model, p) {
			if (_p.set(p).sub(axis_position).cross(main_axis).length2() < NEAR ** 2) {
				p.line_snap = main_axis_snap
				return true
			}
		}}

		// intersect the plane's main axis with a line
		// and return the projected point on the line.
		{
		let int_line = line3()
		let _l1 = line3()
		e.main_axis_hit_line = function(model, line, int_p) {
			let axis = _l1.set(v3.origin, main_axis).transform(model)
			if (!axis.intersect_line(line, int_line))
				return
			let ds = int_line[0].distance2(int_line[1])
			if (ds > NEAR ** 2)
				return
			int_p.set(int_line[1])
			int_p.line_snap = main_axis_snap
			return true
		}}

		return e
	}

	let xyplane = ref_plane(
		'xyplane', v3(0, 0, 1), 'on the blue-red vertical plane',
		'y_axis', v3(0, 1, 0), 'on blue axis')

	let zyplane = ref_plane(
		'zyplane', v3(1, 0, 0), 'on the blue-green vertical plane',
		'z_axis', v3(0, 0, 1), 'on green axis')

	let xzplane = ref_plane(
		'xzplane', v3(0, 1, 0), 'on the horizontal plane',
		'x_axis', v3(1, 0, 0), 'on red axis')

	let ref_planes = [xyplane, zyplane, xzplane]

	function hit_ref_planes(model) {
		// hit horizontal plane first.
		let p = xzplane.mouse_hit_plane(model)
		if (p)
			return p
		// hit vertical ref planes.
		let p1 = xyplane.mouse_hit_plane(model)
		let p2 = zyplane.mouse_hit_plane(model)
		// pick whichever plane is facing the camera more straightly.
		return (p1 ? p1.angle : 1/0) < (p2 ? p2.angle : 1/0) ? p1 : p2
	}

	{
	let ps = [v3(), v3(), v3()]
	let cmp_ps = function(p1, p2) {
		return p1.ds == p2.ds ? 0 : (p1.ds < p2.ds ? -1 : 1)
	}
	function mouse_hit_axes(model) {
		let i = 0
		for (let plane of ref_planes)
			plane.mouse_hit_main_axis(model, ps[i++])
		ps.sort(cmp_ps)
		return ps[0].line_snap ? ps[0] : null
	}}

	// given `p` on `line`, get the axis-intersects-line point that is closest to `p`.
	{
	let int_p = v3()
	let ret = v3()
	function axes_hit_line(model, p, line) {
		let min_ds = 1/0
		let min_int_p
		for (let plane of ref_planes) {
			if (plane.main_axis_hit_line(model, line, int_p)) {
				let ds = sqrt(canvas_p2p_distance2(p, int_p))
				if (ds <= e.hit_d ** 2 && ds <= min_ds) {
					min_ds = ds
					min_int_p = assign(min_int_p || v3(), int_p)
				}
			}
		}
		return min_int_p
	}}

	function check_point_on_axes(model, p) {
		for (let plane of ref_planes)
			if (plane.point_along_main_axis(model, p))
				return true
	}

	// hybrid render+analitic hit-testing -------------------------------------

	let hit_test_rr = gl.hit_test_renderer()

	function render_model_for_hit_test() {
		hit_test_rr.render(draw_model_for_hit_test)
	}

	{
	let _v0 = v3()
	let _l0 = line3()
	let _m0 = mat4()
	let _pl0 = plane()
	function mouse_hit_faces() {

		let rr_hit = hit_test_rr.hit_test(mouse.x, mouse.y)
		if (!rr_hit)
			return

		let comp_id = rr_hit.geom_id >>> 18 // 32K components
		let face_id = rr_hit.geom_id & ((1 << 18) - 1) // 500K faces each
		let inst_id = rr_hit.inst_id

		let comp = comps[comp_id]
		let face = comp.face_at(face_id)

		let model = inst_model(comp, inst_id, _m0)
		let plane = face.plane().to(_pl0).transform(model)
		let int_p = plane.intersect_line(mouse.ray, _v0)
		if (!int_p)
			return

		let path = instance_path(comp, inst_id)

		int_p = int_p.clone() // do not reuse this!
		int_p.comp = comp
		int_p.inst_id = inst_id
		int_p.model = model
		int_p.plane = plane
		int_p.face = face
		int_p.path = path

		return int_p

	}}

	let hit_max_distances = {
		snap: 20,   // max pixel distance for snapping
		select: 8,  // max pixel distance for selecting
	}

	let screen_p2p_distance2 = camera.screen_distance2
	let real_p2p_distance2 = (p1, p2) => p1.distance2(p2)

	function snap_point_on_line(p, line, max_d, p2p_distance2, plane_int_p, axes_int_p) {

		p.i = null
		p.li = line.i
		p.snap = 'line'

		max_d = max_d ** 2
		let mp = line.at(.5, v3())
		let d1 = p2p_distance2(p, line[0])
		let d2 = p2p_distance2(p, line[1])
		let dm = p2p_distance2(p, mp)
		let dp = plane_int_p ? p2p_distance2(p, plane_int_p) : 1/0
		let dx = axes_int_p  ? p2p_distance2(p, axes_int_p ) : 1/0

		if (d1 <= max_d && d1 <= d2 && d1 <= dm && d1 <= dp && d1 <= dx) {
			assign(p, line[0]) // comes with its own point index.
			p.snap = 'point'
		} else if (d2 <= max_d && d2 <= d1 && d2 <= dm && d2 <= dp && d2 <= dx) {
			assign(p, line[1]) // comes with its own point index.
			p.snap = 'point'
		} else if (dp <= max_d && dp <= d1 && dp <= d2 && dp <= dm && dp <= dx) {
			assign(p, plane_int_p) // comes with its own snap flags and indices.
		} else if (dm <= max_d && dm <= d1 && dm <= d2 && dm <= dp && dm <= dx) {
			line.at(.5, p)
			p.snap = 'line_middle'
		} else if (dx <= max_d && dx <= d1 && dx <= d2 && dx <= dm && dx <= dp) {
			assign(p, axes_int_p) // comes with its own snap flags and indices.
		}

	}

	{
	let _v0 = v3()
	function mouse_hit_model(opt) {

		let int_p = mouse_hit_faces()
		let hit_d = hit_max_distances[opt.distance]
		let axes_model = opt.axes_model
		let mode = opt.mode

		if (int_p) {

			// we've hit a face, but we still have to hit any lines
			// that lie in front of it, on it, or intersecting it.

			let face_plane = int_p.plane

			function is_int_line_valid(int_line) {
				let int_p = int_line[1]
				let t = int_p.t
				if (t < 0 || t > 1) return // not intersecting the segment.
				return face_plane.distance_to_point(int_p) >= -NEAR // not behind the plane
			}

			let line_int_p = line_hit_lines(
				mouse.ray, hit_d, screen_p2p_distance2, 't',
				null, is_int_line_valid)

			if (line_int_p) {

				// we've hit a line. snap to it.
				let hit_line = line_int_p.comp.get_line(line_int_p.li)

				// check if the hit line intersects the face plane: that's a snap point.
				let plane_int_p = face_plane.intersect_line(hit_line, _v0, 'strict')

				// check if the hit line intersects any axes originating at line start: that's a snap point.
				let axes_int_p = axes_model && axes_hit_line(axes_model, line_int_p, hit_line)

				// snap the hit point along the hit line along with any additional snap points.
				snap_point_on_line(line_int_p, hit_line, hit_d, screen_p2p_distance2, plane_int_p, axes_int_p)
				if (axes_model)
					check_point_on_axes(axes_model, line_int_p)

				// if the snapped point is not behind the plane, use it, otherwise forget that we even hit the line.
				if (face_plane.distance_to_point(line_int_p) >= -NEAR)
					assign(int_p, line_int_p) // merge snap data.

			} else {

				// free moving on the face face.

			}

		} else {

			function is_int_line_valid(int_line) {
				let int_p = int_line[1]
				let t = int_p.t
				if (t < 0 || t > 1) return // not intersecting the segment.
				return true
			}

			// we haven't hit a face: hit the line closest to the ray regardless of depth.
			int_p = line_hit_lines(
				mouse.ray, hit_d, screen_p2p_distance2, 't',
				null, is_int_line_valid)

			if (int_p) {

				// we've hit a line. snap to it.
				let hit_line = int_p.comp.get_line(int_p.li)

				// check if the hit line intersects any axes originating at line start: that's a snap point.
				let axes_int_p = axes_model && axes_hit_line(axes_model, int_p, hit_line)

				// snap the hit point along the hit line along with any additional snap points.
				snap_point_on_line(int_p, hit_line, hit_d, screen_p2p_distance2, null, axes_int_p)
				if (axes_model)
					check_point_on_axes(axes_model, int_p)

			} else if (mode == 'camera') {

				// chose an arbitrary point at a proportional distance from the camera.
				int_p = mouse.ray.at(min(FAR / 10, camera.pos.len()), _v0)

			} else if (mode == 'draw') {

				// we've hit squat: hit the axes and the ref planes.
				int_p = axes_model && mouse_hit_axes(axes_model) || hit_ref_planes(axes_model || cur_model)

			} else if (mode == 'select') {

				// don't hit anything else so we can unselect all.

			} else
				assert(false)

		}

		return int_p

	}}

	// currently editing instance ---------------------------------------------

	let cur_path = []
	let cur_model = mat4()
	let cur_inv_model = mat4()

	let axes_rr = gl.axes_renderer()
	let axes = axes_rr.axes()

	function enter_edit(path) {
		cur_path.set(path)
		cur_model.reset()
		for (node of path)
			cur_model.mul(node)
		cur_inv_model.set(cur_model).invert()
		axes.model.set(cur_model)
		axes.update()
		instances_valid = false
		render()
	}

	function from_world(v, out) {
		return out.set(v).transform(cur_inv_model)
	}

	function to_world(v, out) {
		return out.set(v).transform(cur_model)
	}

	// skybox -----------------------------------------------------------------

	let skybox = gl.skybox({
		images: {
			posx: 'skybox/posx.jpg',
			negx: 'skybox/negx.jpg',
			posy: 'skybox/posy.jpg',
			negy: 'skybox/negy.jpg',
			posz: 'skybox/posz.jpg',
			negz: 'skybox/negz.jpg',
		},
	})
	skybox.on('load', render)

	// shadow ground plane ----------------------------------------------------

	//let ground_rr = gl.ground_plane_renderer()

	// cursor -----------------------------------------------------------------

	{
	let offsets = {
		line          : [0, 25],
		select        : [5, 12],
		select_add    : [5, 12],
		select_remove : [5, 12],
		select_toggle : [5, 12],
	}
	let cursor
	e.property('cursor', () => cursor, function(name) {
		if (cursor == name)
			return
		cursor = name
		let x = offsets[name] && offsets[name][0] || 0
		let y = offsets[name] && offsets[name][1] || 0
		e.style.cursor = 'url(cursor_'+name+'.png) '+x+' '+y+', auto'
	})
	}

	// cursor tooltip ---------------------------------------------------------

	{
	let tooltip_text = ''
	let tooltip = div({style: `
		position: absolute;
		white-space: nowrap;
		user-select: none;
		margin-left: .5em;
		margin-top : .5em;
		padding: .25em .5em;
		border: 1px solid #aaaa99;
		color: #333;
		background-color: #ffffcc;
		font-family: sans-serif;
		font-size: 12px;
	`}, tooltip_text)

	tooltip.hide()
	e.add(tooltip)

	let show_tooltip_after = timer(function() {
		tooltip.show()
	})

	e.property('tooltip', () => tooltip_text, function(s) {
		tooltip.hide()
		if (s) {
			tooltip.set(s)
			tooltip.x = mouse.x
			tooltip.y = mouse.y
			show_tooltip_after(.2)
		} else {
			show_tooltip_after(false)
		}
	})
	}

	// helper lines -----------------------------------------------------------

	let helper_lines_rr = gl.helper_lines_renderer()

	let helper_lines = {}
	e.line = function(name, line1, color, dashed, visible) {
		line = helper_lines[name]
		if (!line) {
			line = helper_lines_rr.line(line1, color, dashed, visible)
			line.name = name
			helper_lines[name] = line
		} else {
			line.color = color
			line.set(line1)
			line.update()
		}
		render()
		return line
	}

	// html-rendered helper dots ----------------------------------------------

	function dot(point, text, text_class) {

		let s = 'model-editor-dot'
		let e = div({class: (text != null ? s+'-debug '+s+'-debug-'+text_class : s)})
		if (text != null)
			e.set(text)

		e.point = point || v3()

		let _p = v2()
		e.update = function() {
			let p = camera.world_to_screen(e.point, _p)
			e.x = p[0]
			e.y = p[1]
			e.attr('snap', e.point.snap)
		}

		e.update_point = function(p) {
			let snap = e.point.snap
			assign(e.point, p)
			e.point.snap = snap
			e.visible = true
			e.update()
		}

		property(e, 'visible',
			function()  { return !e.hasattr('hidden') },
			function(v) { e.show(!!v) }
		)

		e.free = function() {
			e.remove()
		}

		e.update()
		pe.add(e)

		return e
	}

	function update_dot_positions() {
		for (let ce of e.at)
			if (ce.update)
				ce.update()
	}

	// helper vectors ---------------------------------------------------------

	let helpers = {}

	function v3d(id, vector, origin) {
		let e = helpers[id]
		if (!e) {
			e = new THREE.Group()
			e.line = pe.line(id, line3())
			let geo = new THREE.ConeGeometry(.01, .04)
			geo.translate(0, -.04 / 2, 0)
			geo.rotateX(PI / 2)
			let mat = new THREE.MeshPhongMaterial({color: 0x333333})
			e.cone = new THREE.Mesh(geo, mat)
			e.add(e.line)
			e.add(e.cone)
			e.origin = v3()
			e.vector = v3()
			e.update = function() {
				let len = e.vector.length()
				e.line.line[1].z = len
				e.cone.position.z = len
				e.line.update()
				let p = e.position.clone()
				e.position.set(v3())
				e.lookAt(e.vector)
				e.position.set(p)
			}
			helpers[id] = e
			pe.scene.add(e)
		}
		if (vector)
			e.vector.set(vector)
		if (origin)
			e.position.set(origin)
		e.update()
	}

	// direct-manipulation tools ==============================================

	let tools = {}

	let tool // current tool
	{
		let toolname
		e.property('tool', () => toolname, function(name) {
			e.tooltip = ''
			if (tool && tool.bind)
				tool.bind(false)
			tool = assert(tools[name])
			toolname = name
			e.cursor = tool.cursor || name
			if (tool.bind) {
				tool.bind(true)
				fire_pointermove()
				render()
			}
		})
	}

	// orbit tool -------------------------------------------------------------

	tools.orbit = {}

	tools.orbit.pointerdown = function(capture) {
		let cam0 = camera.clone()
		let mx0 = mouse.x
		let my0 = mouse.y
		let hit_point = mouse_hit_model({mode: 'camera'})
		let panning = shift
		return capture(function() {
			let mx = mouse.x
			let my = mouse.y
			if (shift == !panning) {
				cam0.set(camera)
				mx0 = mx
				my0 = my
				panning = shift
			} else {
				camera.set(cam0)
			}
			if (panning) {
				camera.pan(hit_point, mx0, my0, mx, my)
			} else {
				let dx = (mx - mx0) / 150
				let dy = (my - my0) / 150
				camera.orbit(hit_point, dy, dx, 0)
			}
			update_camera()
		})
	}

	{
	let hit_point

	tools.orbit.keydown = function(key) {
		hit_point = hit_point || mouse_hit_model({mode: 'camera'})
		let x = key == 'ArrowLeft' && -1 || key == 'ArrowRight' && 1 || 0
		let y = key == 'ArrowUp'   && -1 || key == 'ArrowDown'  && 1 || 0
		if (!shift && ctrl && y) {
			camera.dolly(hit_point, 1 + 0.4 * (key == 'ArrowDown' ? 1 : -1))
			update_camera()
			return false
		}
		if (!shift && !ctrl && (x || y)) {
			let dx = -50 * x
			let dy = -50 * y
			camera.pan(hit_point, mouse.x, mouse.y, mouse.x + dx, mouse.y + dy)
			update_camera()
			return false
		}
		if (shift && !ctrl && (x || y)) {
			let dx = x / -10
			let dy = y / -10
			camera.orbit(hit_point, dy, dx, 0)
			update_camera()
			return false
		}
	}

	tools.orbit.keyup = function(key) {
		if (key != 'Shift' && key != 'Control' && key != 'Alt')
			hit_point = null
	}

	}

	// select tool ------------------------------------------------------------

	tools.select = {}

	{
	let mode
	let p

	let update_mode = function() {
		mode = shift && ctrl && 'remove'
			|| shift && 'toggle' || ctrl && 'add' || null
		e.cursor = 'select' + (mode && '_' + mode || '')
		if (mode == 'remove') mode = false
		if (mode == 'add') mode = true
	}

	tools.select.keydown = function() {
		update_mode()
	}

	tools.select.keyup = function() {
		update_mode()
	}

	tools.select.click = function(nclicks) {
		if (nclicks > 3)
			return
		let p = mouse_hit_model({mode: 'select', distance: 'select'})
		if (!p && nclicks == 1 && !mode) {
			select_all(false)
		} else if (p && nclicks == 3) {
			select_all(true)
		} else if (p && nclicks <= 2) {
			if (!mode)
				select_all(false)
			if (p.li != null) {
				p.comp.select_line(p.li, mode, nclicks == 2)
			} else if (p.face != null) {
				p.comp.select_face(p.face, mode, nclicks == 2)
			}
		}
	}

	/*
	function is_int_line_valid(int_line) {
		let int_p = int_line[1]
		let t = int_p.t
		//print('is_int_line_valid-2', int_p.li, t)
		if (t < 0 || t > 1) return // not intersecting the segment.
		return true
	}

	tools.select.pointermove = function() {

		let line_int_p = line_hit_lines(
			mouse.ray.clone(), 20, screen_p2p_distance2, 't',
			null, is_int_line_valid)

		if (line_int_p) {
			e.line('int_line', line_int_p.int_line.clone(), 0, false)
		}

	}
	*/

	}

	// move tool --------------------------------------------------------------

	tools.move = {}

	// line tool --------------------------------------------------------------

	tools.line = {}

	let cur_point, cur_line, ref_point, ref_line

	tools.line.bind = function(on) {
		if (on) {
			let endp = v3()
			cur_point = e.dot(endp)
			cur_point.visible = false

			cur_line = e.line('cur_line', line3(v3(), endp), black, false, false)

			ref_point = e.dot()
			ref_point.point.snap = 'ref_point'
			ref_point.visible = false

			ref_line = e.line('ref_line', line3(), black, true, false)
		} else {
			cur_point = cur_point.free()
			cur_line  = cur_line.free()
			ref_point = ref_point.free()
			ref_line  = ref_line.free()
		}
	}

	tools.line.cancel = function() {
		e.tooltip = ''
		cur_line.visible = false
		cur_line.update()
		ref_point.visible = false
		ref_line.visible = false
		reF_line.update()
	}

	let snap_tooltips = {
		// for current point
		point: 'at point',
		line: 'on edge',
		line_middle: 'at midpoint',
		line_plane_intersection: 'on line-plane intersection',
		face: 'on face',
		// for current line
		line_point_intersection: 'on line touching point',
	}

	let line_snap_colors = {
		y_axis: y_axis_color,
		x_axis: x_axis_color,
		z_axis: z_axis_color,
		line_point_intersection: ref_color,
	}

	let future_ref_point = v3()
	let ref_point_update_after = timer(function() {
		ref_point.update_point(future_ref_point)
	})

	tools.line.pointermove = function() {

		let p1 = cur_line[0]
		let p2 = cur_line[1]
		p2.i = null
		p2.face = null
		p2.li = null
		p2.snap = null
		p2.line_snap = null
		p2.tooltip = null

		ref_line.snap = null
		ref_line.visible = false

		ref_point_update_after(false)

		e.hit_d = snap_distance
		let p = mouse_hit_model(cur_line.visible ? p1 : null, true)

		if (p) {

			// change the ref point.
			if ((p.snap == 'point' || p.snap == 'line_middle')
				&& (p.i == null || !cur_line.visible || p.i != cur_line[0].i)
			) {
				assign(future_ref_point, p)
				ref_point_update_after(.5)
			}

			if (!cur_line.visible) { // moving the start point

				if (!p.snap) { // free-moving point.

					// snap point to axes originating at the ref point.
					if (ref_point.visible) {
						let axes_int_p = hit_axes(ref_point.point)
						if (axes_int_p) {
							p = axes_int_p
							ref_line.snap = p.line_snap
							ref_line.update_endpoints(ref_point.point, p)
						}
					}

				}

				assign(p1, p)
				assign(p2, p)

			} else { // moving the line end-point.

				if (!p.snap) { // (semi-)free-moving point.

					// NOTE: p.line_snap makes the hit point lose one degree of freedom,
					// so there's still one degree of freedom to lose to point-snapping.

					// snap point to axes originating at the ref point.
					if (ref_point.visible) {
						assign(p2, p)
						let p_line_snap = p.line_snap
						let axes_int_p = axes_hit_line(ref_point.point, p, cur_line)
						if (axes_int_p && canvas_p2p_distance2(axes_int_p, p) <= e.hit_d ** 2) {
							assign(p, axes_int_p)
							ref_line.snap = axes_int_p.line_snap
							p.line_snap = p_line_snap
							ref_line.update_endpoints(ref_point.point, p)
						}

					}

					// TODO: check again if the snapped point hits the model.

				}

				assign(p2, p)

			}

		}

		p = p2

		cur_point.visible = !!p.snap
		e.tooltip = snap_tooltips[p.snap || p.line_snap] || p.tooltip
		cur_point.snap = p2.snap
		cur_line.color = or(line_snap_colors[p2.line_snap], black)
		ref_line.color = or(line_snap_colors[ref_line.snap], black)

		cur_point.update()
		cur_line.update()
		ref_line.update()

		render()
	}

	tools.line.pointerdown = function() {
		e.tooltip = ''
		if (cur_line.visible) {
			let closing = cur_line[1].i != null || cur_line[1].li != null
			e.model.draw_line(cur_line)
			ref_point.visible = false
			if (closing) {
				tools.line.cancel()
			} else {
				cur_line[0].set(cur_line[1])
				cur_line[0].i = cur_line[1].i
				cur_line.update()
			}
		} else {
			if (cur_line[0].i != null && ref_point.point.i == cur_line[0].i)
				ref_point.visible = false
			cur_line.visible = true
			cur_line.update()
		}
	}

	// rectangle tool ---------------------------------------------------------

	tools.rect = {}

	tools.rect.pointerdown = function() {

	}

	// push/pull tool ---------------------------------------------------------

	tools.pull = {}

	{
		let hit_p // point on the plane hit for pulling.
		let pull  // pull state for live pulling.

		tools.pull.bind = function(on) {
			if (!on)
				tools.pull.cancel()
		}

		tools.pull.pointermove = function() {
			if (pull) {
				move()
				return true
			} else {
				let p = mouse_hit_faces()
				if (p && p.snap == 'face') {
					p.comp.select_face(p.face)
				} else {
					p = null
					select_all(false)
				}
				hit_p = p
				if ((hit_p && hit_p.face) !== (p && p.face)) // hit face changed
					render()
			}
		}

		let _line = line3()

		function move() {
			if (!pull)
				start()
			let p = mouse_hit_model()
			if (!p || !pull.can_hit(p)) {
				let int_line = mouse.ray.intersectLine(pull.dir, false, _line)
				if (int_line)
					p = int_line[0]

			}
			if (p)
				pull.pull(p)
		}

		function start() {
			pull = e.model.start_pull(hit_p)
		}

		function stop() {
			pull.stop()
			pull = null
			select_all(false)
		}

		tools.pull.pointerdown = function(capture) {
			if (pull) {
				stop()
			} else if (hit_p != null) {
				return capture(move, function() {
					if (pull)
						stop()
					else
						start()
				})
			}
		}

		tools.pull.cancel = function() {
			if (pull) {
				pull.cancel()
				pull = null
			}
		}

	}

	// mouse handling ---------------------------------------------------------

	let mouse = v3()
	mouse.ray = line3()

	function update_mouse(ev, mx, my, opt) {
		if (!mouse.valid && opt && opt.validate) {
			update_model()
			render_model_for_hit_test()
			mouse.valid = true
		}
		let r = e.rect()
		mx -= r.x
		my -= r.y
		let pos_changed = mx != mouse[0] || my != mouse[1]
		mouse[0] = mx
		mouse[1] = my
		if (opt && opt.left_down != null)
			mouse.left = opt.left_down
		update_keys(ev)
		if (pos_changed)
			camera.raycast(mx, my, mouse.ray)
		return pos_changed
	}

	let shift, ctrl, alt
	function update_keys(ev) {
		shift = ev.shiftKey
		ctrl  = ev.ctrlKey
		alt   = ev.altKey
	}

	function fire_pointermove() {
		if (tool.pointermove)
			tool.pointermove()
	}

	e.on('pointermove', function(ev, mx, my) {
		update_mouse(ev, mx, my)
		fire_pointermove()
	})

	e.on('pointerdown', function(ev, mx, my) {
		if (update_mouse(ev, mx, my, {validate: true, left_down: true}))
			fire_pointermove()
		if (tool.pointerdown) {
			let captured, captured_move
			function capture(move, up) {
				let movewrap = move && function(ev, mx, my) {
					update_mouse(ev, mx, my)
					return move()
				}
				let upwrap = up && function(ev, mx, my) {
					update_mouse(ev, mx, my, {validate: true, left_down: false})
					return up()
				}
				captured = e.capture_pointer(ev, movewrap, upwrap)
				captured_move = move
			}
			tool.pointerdown(capture)
			// guarantee a mouse move and render after mouse down.
			if (!captured)
				fire_pointermove()
			else if (captured_move)
				captured_move()
			render()
			return captured
		}
	})

	e.on('pointerup', function(ev, mx, my) {
		if (update_mouse(ev, mx, my, {validate: true, left_down: false}))
			fire_pointermove()
		if (tool.pointerup) {
			tool.pointerup()
			// guarantee a mouse move and render after mouse up.
			fire_pointermove()
			render()
		}
	})

	e.on('pointerleave', function(ev) {
		e.tooltip = ''
	})

	e.on('click', function(ev, nclicks, mx, my) {
		if (update_mouse(ev, mx, my, {validate: true}))
			fire_pointermove()
		if (tool.click) {
			tool.click(nclicks)
			// guarantee a mouse move and render after click.
			fire_pointermove()
			render()
		}
	})

	e.on('wheel', function(ev, dy, mx, my) {
		if (update_mouse(ev, mx, my, {validate: true}))
			fire_pointermove()
		let hit_point = mouse_hit_model({mode: 'camera'})
		camera.dolly(hit_point, 1 + 0.4 * dy)
		update_camera()
		return false
	})

	// key handling -----------------------------------------------------------

	let tool_keys = {
		l: 'line',
		r: 'rect',
		p: 'pull',
		o: 'orbit',
		m: 'move',
	}

	e.on('keydown', function(key, shift, ctrl, alt, ev) {
		update_keys(ev)
		if (key == 'Delete') {
			remove_selection()
			render()
		} else if (key == 'h') {
			e.model.toggle_invisible_lines()
			render()
		}
		if (tool.keydown)
			if (tool.keydown(key) === false)
				return false
		if (key == 'Escape')
			if (tool.cancel)
				tool.cancel()
		if (shift || ctrl)
			return
		let toolname = tool_keys[key.toLowerCase()]
		if (toolname) {
			e.tool = toolname
			return false
		} else if (key == ' ') {
			e.tool = e.tool == 'select' ? 'orbit' : 'select'
			return false
		}
	})

	e.on('keyup', function(key, shift, ctrl, alt, ev) {
		update_keys(ev)
		if (tool.keyup)
			if (tool.keyup(key) === false)
				return false
	})

	// scripting API ----------------------------------------------------------

	e.start_undo = start_undo
	e.push_undo = push_undo
	e.undo = undo
	e.redo = redo

	e.add_material = add_material
	e.default_material = default_material

	e.create_component = create_component
	e.gc_components = gc_components

	// test cube --------------------------------------------------------------

	function create_test_objects() {

		let mat1 = e.add_material({diffuse_color: 0xff9900})
		let mat2 = e.add_material({diffuse_color: 0x0099ff})

		let m = {
			points: [
				 0,  0, -1,
				 2,  0, -1,
				 2,  2,  0,
				 0,  2,  0,
				 0,  0,  2,
				 2,  0,  2,
				 2,  2,  2,
				 0,  2,  2,
				 0,  0,  0,
				-1,  1,  0,
			],
			faces: [
				[1, 0, 3, 2],
				[4, 5, 6, 7],
				[7, 6, 2, 3], //[6, 2, 3],
				[4, 0, 1, 5],
				[0, 4, 7, 3],
				[5, 1, 2, 6],
			],
			lines: [
				8, 9,
			],
		}

		m.faces[0].material = mat1
		m.faces[1].material = mat1
		m.faces[2].material = mat2

		root.comp.set(m)

		root.comp.set_line_smoothness(0, 1)
		root.comp.set_line_smoothness(2, 1)
		root.comp.set_line_opacity(0, 0)
		root.comp.set_line_opacity(2, 0)

		let c0 = root.comp
		let c1 = e.create_component({name: 'c1'})
		let c2 = e.create_component({name: 'c2'})

		m.faces[0].material = null
		m.faces[1].material = null

		c1.set(m)

		m.faces[2].material = null

		c2.set(m)

		c0.add_child(c1, mat4().translate(3, 0, 0))
		c1.add_child(c2, mat4().translate(3, 0, 0))

		for (let i = 0; i < 2; i++)
			for (let j = 0; j < 2; j++)
				for (let k = 0; k < 2; k++)
					c1.add_child(c2, mat4().translate(0 + i * 3, 3 + j * 3, -5 - k * 3))

	}

	// init -------------------------------------------------------------------

	init_layers()
	init_root()
	init_renderer()
	update_sun_pos()
	create_test_objects()
	enter_edit([root, root.comp.children[0], root.comp.children[0].comp.children[1]])

	e.tool = 'orbit'
	render()

})
