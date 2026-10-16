#[test]
fn host_surface_edits_automate_and_reopen() {
    use std::sync::atomic::AtomicUsize;
    struct HostLog {
        restarts: AtomicUsize,
        rescans: Mutex<Vec<u32>>,
        clears: Mutex<Vec<u32>>,
    }
    unsafe extern "C" fn restart(host: *const clap_host) {
        let log = unsafe { &*((*host).host_data as *const HostLog) };
        log.restarts.fetch_add(1, Ordering::SeqCst);
    }
    unsafe extern "C" fn rescan(host: *const clap_host, flags: u32) {
        let log = unsafe { &*((*host).host_data as *const HostLog) };
        log.rescans.lock().unwrap().push(flags);
    }
    unsafe extern "C" fn clear(host: *const clap_host, id: u32, _: u32) {
        let log = unsafe { &*((*host).host_data as *const HostLog) };
        log.clears.lock().unwrap().push(id);
    }
    unsafe extern "C" fn extension(_: *const clap_host, id: *const c_char) -> *const c_void {
        static PARAMS: clap_host_params = clap_host_params {
            rescan: Some(rescan),
            clear: Some(clear),
            request_flush: None,
        };
        if unsafe { CStr::from_ptr(id) } == CLAP_EXT_PARAMS {
            (&PARAMS as *const clap_host_params).cast()
        } else {
            null()
        }
    }
    let mut log = HostLog {
        restarts: AtomicUsize::new(0),
        rescans: Mutex::new(vec![]),
        clears: Mutex::new(vec![]),
    };
    let host = clap_host {
        clap_version: clap_sys::version::CLAP_VERSION,
        host_data: (&mut log as *mut HostLog).cast(),
        name: c"Scale test".as_ptr(),
        vendor: c"Manifold".as_ptr(),
        url: c"".as_ptr(),
        version: c"1".as_ptr(),
        get_extension: Some(extension),
        request_restart: Some(restart),
        request_process: None,
        request_callback: None,
    };
    let exported = crate::product::EXPORTED;
    let last_slot = if exported { 1_000_000 } else { 2047 };
    let expected_count = |controls| if exported { controls } else { 2048 };
    let instance = Instance::new(&host, &crate::GRAPH_DESCRIPTOR);
    assert!(instance.restore(host_scale::project(600, last_slot)));
    assert_eq!(
        unsafe { param_count(&instance.plugin) },
        expected_count(600)
    );
    let mut info: clap_param_info = unsafe { std::mem::zeroed() };
    assert!(unsafe {
        param_info(
            &instance.plugin,
            if exported { 599 } else { 2047 },
            &mut info,
        )
    });
    assert_eq!(info.id, HOST_SLOT_BASE + last_slot);
    assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
    let event = clap_event_param_value {
        header: clap_event_header {
            size: std::mem::size_of::<clap_event_param_value>() as u32,
            time: 0,
            space_id: CLAP_CORE_EVENT_SPACE_ID,
            type_: CLAP_EVENT_PARAM_VALUE,
            flags: 0,
        },
        param_id: info.id,
        cookie: null_mut(),
        note_id: -1,
        port_index: -1,
        channel: -1,
        key: -1,
        value: if exported { 2.0 } else { 0.25 },
    };
    let pointers = vec![&event.header as *const clap_event_header];
    let events = clap_input_events {
        ctx: (&pointers as *const Vec<*const clap_event_header>)
            .cast_mut()
            .cast(),
        size: Some(event_count),
        get: Some(event_get),
    };
    callback_heap::measure(|| unsafe { flush(&instance.plugin, &events, null()) });
    for _ in 0..32 {
        callback_heap::measure(|| render_owned_loop_block(&instance, 0));
    }
    let saved = instance.published_state_bytes().unwrap();
    assert_eq!(host_scale::last_gain(&saved, 600), 2.0);
    let reopened = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
    assert!(reopened.restore(saved));
    assert_eq!(
        unsafe { param_count(&reopened.plugin) },
        expected_count(600)
    );
    let mut value = 0.;
    assert!(unsafe { param_value(&reopened.plugin, info.id, &mut value) });
    assert!((value - if exported { 2.0 } else { 0.25 }).abs() < 1e-6);
    let old = Arc::clone(&instance.values.lock().unwrap());
    log.rescans.lock().unwrap().clear();
    for (count, slot) in [(620, last_slot), (580, last_slot - 1)] {
        let before = unsafe { param_count(&instance.plugin) };
        assert!(instance.restore(host_scale::project(count, slot)));
        assert_eq!(unsafe { param_count(&instance.plugin) }, before);
        assert_eq!(
            instance.awaiting_parameter_restart.load(Ordering::Acquire),
            exported
        );
        callback_heap::measure(|| render_owned_loop_block(&instance, 0));
        assert_eq!(unsafe { param_count(&instance.plugin) }, before);
        assert!(
            log.rescans
                .lock()
                .unwrap()
                .iter()
                .all(|flags| flags & CLAP_PARAM_RESCAN_ALL == 0),
            "no active full rescan"
        );
        if !exported {
            assert_eq!(
                NativeProject::parse(&instance.published_state_bytes().unwrap())
                    .unwrap()
                    .host_bindings()
                    .len(),
                count as usize,
                "Studio graph publishes while host remains active"
            );
            assert_eq!(log.restarts.load(Ordering::SeqCst), 0);
        }
        instance.deactivate();
        assert_eq!(
            unsafe { param_count(&instance.plugin) },
            expected_count(count)
        );
        if exported {
            assert_eq!(*log.rescans.lock().unwrap(), vec![CLAP_PARAM_RESCAN_ALL]);
        }
        log.rescans.lock().unwrap().clear();
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        callback_heap::measure(|| render_owned_loop_block(&instance, 0));
        assert_eq!(
            NativeProject::parse(&instance.published_state_bytes().unwrap())
                .unwrap()
                .host_bindings()
                .len(),
            count as usize
        );
    }
    assert_eq!(
        log.restarts.load(Ordering::SeqCst),
        if exported { 2 } else { 0 }
    );
    assert_eq!(
        log.clears
            .lock()
            .unwrap()
            .contains(&(HOST_SLOT_BASE + last_slot)),
        exported
    );
    assert!((old.read_slot(last_slot as usize) - 0.25).abs() < 1e-6);
    for discrete in [false, true] {
        log.restarts.store(0, Ordering::SeqCst);
        log.rescans.lock().unwrap().clear();
        assert!(instance.restore(host_scale::displayed_project(discrete)));
        assert_eq!(
            instance.awaiting_parameter_restart.load(Ordering::Acquire),
            exported
        );
        assert_eq!(log.restarts.load(Ordering::SeqCst), usize::from(exported));
        if exported {
            instance.deactivate();
        } else {
            callback_heap::measure(|| render_owned_loop_block(&instance, 0));
        }
        instance.rescan_parameters_on_main_thread();
        assert!(unsafe { param_info(&instance.plugin, 0, &mut info) });
        assert_eq!(
            unsafe { CStr::from_ptr(info.name.as_ptr()) }
                .to_str()
                .unwrap(),
            if discrete {
                "Filter shape"
            } else {
                "Output level"
            }
        );
        assert_eq!(info.min_value, 0.);
        assert_eq!(info.max_value, if exported { 2. } else { 1. });
        assert_eq!(
            info.flags & CLAP_PARAM_IS_STEPPED != 0,
            exported && discrete
        );
        assert_eq!(info.default_value, if exported { 1. } else { 0. });
        if !exported {
            assert!(
                log.rescans
                    .lock()
                    .unwrap()
                    .iter()
                    .all(|flags| flags & CLAP_PARAM_RESCAN_ALL == 0)
            );
        }
        if exported {
            assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        }
    }
    instance.deactivate();
}
