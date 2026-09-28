use manifold_core::events::EventKind;
use manifold_core::main_instrument::MainInstrument;
use manifold_native::project::NativeProject;

const DEFAULT_INSERT: &[u8] =
    include_bytes!("../../../projects/main-looper/default-rack-insert.json");
const CV_INSERT: &[u8] =
    include_bytes!("../../../projects/main-looper/lfo-filter-rack-insert.json");

fn render_with_route(project: Option<&[u8]>, cutoff: f32, main_route: bool) -> (f32, f32) {
    let mut main = MainInstrument::new(48_000.0, 128);
    assert!(main.set_synth_parameter(22, cutoff));
    if main_route {
        assert!(main.set_lfo_slot_parameter(0, 0, 3.0));
        assert!(main.set_lfo_slot_parameter(0, 1, 1.0));
        assert!(main.set_modulation_slot_route(0, 1, 22.0));
        assert!(main.set_modulation_slot_route(0, 2, 0.5));
        assert!(main.set_modulation_slot_route(0, 5, 1.0));
    }
    if let Some(project) = project {
        let mut plan = NativeProject::parse(project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap()
            .into_plan();
        main.prepare_rack_insert_controls(&mut plan);
        assert!(
            main.replace_prepared_rack_insert(Some(plan))
                .unwrap()
                .is_none()
        );
    }
    main.synth_event(EventKind::NoteOn {
        channel: 0,
        note: 96,
        velocity: 120,
    });
    let dry = [0.0; 128];
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    let mut energy = 0.0;
    for block in 0..120 {
        main.process([&dry, &dry], [&mut left, &mut right]);
        if block >= 40 {
            energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
        }
    }
    (energy, main.looper().peak(0, 1, 8_000, 12_000))
}

fn render(project: Option<&[u8]>, cutoff: f32) -> (f32, f32) {
    render_with_route(project, cutoff, false)
}

#[test]
fn authored_insert_reuses_main_voice_and_changes_the_looper_monitor() {
    let (fixed, fixed_capture) = render(None, 800.0);
    let (default_insert, default_capture) = render(Some(DEFAULT_INSERT), 800.0);
    let (cv_insert, cv_capture) = render(Some(CV_INSERT), 800.0);
    println!(
        "fixed={fixed:.6} default_insert={default_insert:.6} cv_insert={cv_insert:.6} capture={fixed_capture:.6}/{default_capture:.6}/{cv_capture:.6}"
    );
    assert!(fixed > 1.0);
    assert!(
        (default_insert - fixed).abs() < fixed * 0.001,
        "fixed {fixed}, authored default {default_insert}"
    );
    assert!(
        cv_insert > default_insert * 3.0,
        "default {default_insert}, CV cable {cv_insert}"
    );
    assert!((default_capture - fixed_capture).abs() < fixed_capture * 0.001);
    assert!(cv_capture > default_capture * 2.0);
}

#[test]
fn main_controls_reach_the_prepared_insert_and_bad_preparation_keeps_the_old_plan() {
    let mut main = MainInstrument::new(48_000.0, 128);
    let mut insert = NativeProject::parse(DEFAULT_INSERT)
        .unwrap()
        .prepare(48_000.0, 128)
        .unwrap()
        .into_plan();
    main.prepare_rack_insert_controls(&mut insert);
    main.replace_prepared_rack_insert(Some(insert)).unwrap();
    assert!(main.has_rack_insert());
    let incompatible = NativeProject::parse(DEFAULT_INSERT)
        .unwrap()
        .prepare(44_100.0, 128)
        .unwrap()
        .into_plan();
    assert!(
        main.replace_prepared_rack_insert(Some(incompatible))
            .is_err()
    );
    assert!(main.has_rack_insert());
    assert!(main.set_synth_parameter(22, 80.0));
    main.synth_event(EventKind::NoteOn {
        channel: 0,
        note: 96,
        velocity: 120,
    });
    let dry = [0.0; 128];
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    let mut energy = 0.0;
    for block in 0..120 {
        main.process([&dry, &dry], [&mut left, &mut right]);
        if block >= 40 {
            energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
        }
    }
    let (expected, _) = render(Some(DEFAULT_INSERT), 80.0);
    assert!((energy - expected).abs() < expected * 0.001);
    let retired = main.replace_prepared_rack_insert(None).unwrap();
    assert!(retired.is_some());
    assert!(!main.has_rack_insert());
}

#[test]
fn existing_main_lfo_route_stays_audible_through_the_default_insert() {
    let (plain, _) = render(Some(DEFAULT_INSERT), 800.0);
    let (fixed, _) = render_with_route(None, 800.0, true);
    let (insert, _) = render_with_route(Some(DEFAULT_INSERT), 800.0, true);
    assert!((fixed - plain).abs() > plain * 0.1);
    assert!(
        (insert - fixed).abs() < fixed * 0.001,
        "fixed {fixed}, insert {insert}"
    );
}
