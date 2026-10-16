use std::cell::Cell;
use std::rc::Rc;

use rquickjs::{Context, Runtime};

// A timeout between search iterations must not release the previous item twice.
// Keep the array alive across the exception, then read it and tear down the VM.
#[test]
fn interrupted_array_search_preserves_objects_and_shuts_down_cleanly() {
    for method in ["find", "findIndex", "findLast", "findLastIndex"] {
        for phase in 0..2 {
            for budget in 1..=8 {
                let runtime = Runtime::new().unwrap();
                let context = Context::full(&runtime).unwrap();
                context.with(|ctx| {
                    ctx.eval::<(), _>(
                        "globalThis.values = Array.from({length: 10000}, (_, index) => ({index}));",
                    )
                    .unwrap();
                });
                // Shift the VM poll counter so both the predicate call and the
                // search loop itself can be the interrupted site.
                for _ in 0..phase {
                    context.with(|ctx| ctx.eval::<(), _>("void 0").unwrap());
                }
                let polls = Rc::new(Cell::new(0));
                let counter = Rc::clone(&polls);
                let enabled = Rc::new(Cell::new(true));
                let interrupt_enabled = Rc::clone(&enabled);
                runtime.set_interrupt_handler(Some(Box::new(move || {
                    counter.set(counter.get() + 1);
                    interrupt_enabled.get() && counter.get() >= budget
                })));
                context.with(|ctx| {
                    let result = ctx.eval::<(), _>(format!(
                        "for (;;) values.{method}(value => value.index < 0);"
                    ));
                    enabled.set(false);
                    assert!(
                        result.unwrap_err().is_exception(),
                        "{method}, budget {budget}"
                    );
                    let _ = ctx.catch();
                    assert_eq!(
                        ctx.eval::<i32, _>("values.reduce((sum, value) => sum + value.index, 0)")
                            .unwrap(),
                        49_995_000,
                        "{method}, budget {budget}"
                    );
                });
            }
        }
    }
}
