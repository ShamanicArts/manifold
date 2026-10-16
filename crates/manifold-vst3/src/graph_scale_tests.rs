#[test]
fn host_surface_edits_automate_and_reopen() {
    struct Handler(Arc<Mutex<Vec<i32>>>);
    impl vst3::Class for Handler {
        type Interfaces = (IComponentHandler,);
    }
    impl IComponentHandlerTrait for Handler {
        unsafe fn beginEdit(&self, _: u32) -> tresult {
            kResultOk
        }
        unsafe fn performEdit(&self, _: u32, _: f64) -> tresult {
            kResultOk
        }
        unsafe fn endEdit(&self, _: u32) -> tresult {
            kResultOk
        }
        unsafe fn restartComponent(&self, flags: i32) -> tresult {
            self.0.lock().unwrap().push(flags);
            kResultOk
        }
    }
    let calls = Arc::new(Mutex::new(vec![]));
    let handler = vst3::ComWrapper::new(Handler(calls.clone()))
        .to_com_ptr::<IComponentHandler>()
        .unwrap();
    let exported = crate::product::EXPORTED;
    let last_slot = if exported { 1_000_000 } else { 2047 };
    let expected_count = if exported { 600 } else { 2048 };
    let source = host_scale::project(600, last_slot);
    let component = GraphProcessor::new();
    assert_eq!(component.restore_bytes(source.clone()), kResultOk);
    assert_eq!(component.descriptors.lock().unwrap().len(), expected_count);
    let controller = GraphController::new();
    assert_eq!(
        unsafe { controller.setComponentHandler(handler.as_ptr()) },
        kResultOk
    );
    let (stream, _) = test_stream(source);
    assert_eq!(
        unsafe { controller.setComponentState(stream.as_ptr()) },
        kResultOk
    );
    assert_eq!(
        unsafe { controller.getParameterCount() },
        expected_count as i32
    );
    let mut info: ParameterInfo = unsafe { std::mem::zeroed() };
    assert_eq!(
        unsafe { controller.getParameterInfo(if exported { 599 } else { 2047 }, &mut info) },
        kResultOk
    );
    assert_eq!(info.id, HOST_SLOT_BASE + last_slot);
    assert_eq!(
        unsafe { controller.setParamNormalized(info.id, 0.25) },
        kResultOk
    );
    assert_eq!(unsafe { controller.getParamNormalized(info.id) }, 0.25);
    let mut setup = ProcessSetup {
        processMode: 0,
        symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
        maxSamplesPerBlock: 128,
        sampleRate: 48_000.,
    };
    assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
    assert_eq!(unsafe { component.setActive(1) }, kResultOk);
    let automation = automation_probe::changes(last_slot, 0, 0.25);
    callback_heap::measure(|| render_package_block_automated(&component, Some(&automation)));
    for _ in 0..32 {
        callback_heap::measure(|| render_package_block(&component));
    }
    let saved = component.capture_published_state().unwrap();
    assert_eq!(host_scale::last_gain(&saved, 600), 2.0);
    let bank = Arc::clone(&component.values.lock().unwrap());
    assert!((bank.read_slot(last_slot as usize) - 0.25).abs() < 1e-6);
    let reopened = GraphProcessor::new();
    assert_eq!(reopened.restore_bytes(saved), kResultOk);
    assert_eq!(reopened.descriptors.lock().unwrap().len(), expected_count);
    assert!(
        (reopened
            .values
            .lock()
            .unwrap()
            .read_slot(last_slot as usize)
            - 0.25)
            .abs()
            < 1e-6
    );
    for count in [620, 580] {
        assert_eq!(
            component.restore_bytes(host_scale::project(count, last_slot)),
            kResultOk
        );
        callback_heap::measure(|| render_package_block(&component));
        calls.lock().unwrap().clear();
        let (stream, _) = test_stream(component.capture_published_state().unwrap());
        assert_eq!(
            unsafe { controller.setComponentState(stream.as_ptr()) },
            kResultOk
        );
        assert_eq!(
            calls.lock().unwrap().last().unwrap() & RestartFlags_::kReloadComponent != 0,
            exported
        );
        assert_eq!(
            unsafe { controller.getParameterCount() },
            if exported { count as i32 } else { 2048 }
        );
        assert_eq!(
            NativeProject::parse(&component.capture_published_state().unwrap())
                .unwrap()
                .host_bindings()
                .len(),
            count as usize
        );
    }
    assert!(
        (bank.read_slot(last_slot as usize) - 0.25).abs() < 1e-6,
        "retired bank is not reused by replacements"
    );
    component.deactivate();
    for discrete in [false, true] {
        calls.lock().unwrap().clear();
        let (stream, _) = test_stream(host_scale::displayed_project(discrete));
        assert_eq!(
            unsafe { controller.setComponentState(stream.as_ptr()) },
            kResultOk
        );
        assert_eq!(
            calls.lock().unwrap().last().unwrap() & RestartFlags_::kReloadComponent != 0,
            exported
        );
        assert_eq!(
            unsafe { controller.getParameterInfo(0, &mut info) },
            kResultOk
        );
        assert_eq!(
            String::from_utf16_lossy(&info.title).trim_end_matches('\0'),
            if discrete {
                "tone / Filter shape"
            } else {
                "tone / Output level"
            }
        );
        assert_eq!(info.stepCount, if exported && discrete { 2 } else { 0 });
        assert_eq!(info.defaultNormalizedValue, if exported { 0.5 } else { 0. });
        assert_eq!(
            unsafe { controller.normalizedParamToPlain(info.id, 0.5) },
            if exported { 1. } else { 0.5 }
        );
        assert_eq!(
            unsafe { controller.plainParamToNormalized(info.id, if exported { 1. } else { 0.5 }) },
            0.5
        );
    }
}
