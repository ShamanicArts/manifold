//! Presentation-only egui client of the public live-project model. The Studio
//! workspace that edits projects lives in the Studio application crate.
//! Input snapshots and output commands never access or own a DSP kernel.
use eframe::egui::{self, Color32, Pos2, Sense, Stroke, Vec2};
use serde::Deserialize;
pub mod gesture;

#[derive(Clone, Default, Deserialize)]
pub struct Component {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub base: String,
    #[serde(default)]
    pub choices: Vec<String>,
    #[serde(default, rename = "choiceValues")]
    pub choice_values: Vec<f64>,
    #[serde(default, rename = "disabledChoices")]
    pub disabled_choices: Vec<usize>,
    #[serde(default, rename = "inlineChoices")]
    pub inline_choices: bool,
    #[serde(default)]
    pub group: String,
    #[serde(default, rename = "firstNote")]
    pub first_note: Option<u8>,
    #[serde(default, rename = "noteCount")]
    pub note_count: Option<u8>,
    #[serde(default, rename = "activeNotes")]
    pub active_notes: Vec<u8>,
    #[serde(default)]
    pub points: Vec<[f32; 2]>,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub style: ComponentStyle,
    #[serde(default)]
    pub height: Option<f32>,
    #[serde(default, rename = "fontSize")]
    pub font_size: Option<f32>,
}

/// Portable presentation colors. These are consumed only on the UI thread.
#[derive(Clone, Default, Deserialize)]
pub struct ComponentStyle {
    #[serde(default)]
    pub accent: String,
    #[serde(default)]
    pub background: String,
    #[serde(default)]
    pub text: String,
}
fn color(value: &str, fallback: Color32) -> Color32 {
    if value.len() != 7 || !value.starts_with('#') { return fallback; }
    u32::from_str_radix(&value[1..], 16).map(|rgb|
        Color32::from_rgb((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8)
    ).unwrap_or(fallback)
}
fn heading_color(components: &[Component], group: &str) -> Color32 {
    components.iter().find(|c| c.group == group).map(|c|
        color(&c.style.accent, Color32::from_rgb(187, 162, 232))
    ).unwrap_or(Color32::from_rgb(187, 162, 232))
}

#[derive(Clone, Default, Deserialize, serde::Serialize)]
pub struct Parameter {
    pub path: String,
    pub min: f64,
    pub max: f64,
    pub value: f64,
    #[serde(default)]
    pub default: f64,
    #[serde(default)]
    pub discrete: bool,
    #[serde(default)]
    pub operation: String,
}

#[derive(Default, Deserialize)]
pub struct ViewSnapshot {
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub components: Vec<Component>,
    #[serde(default)]
    pub parameters: Vec<Parameter>,
}

#[derive(Default)]
pub struct ProjectView {
    pub state: ViewSnapshot,
    pub commands: Vec<serde_json::Value>,
    repaint: Option<egui::Context>,
    pub control_geometry: Vec<serde_json::Value>,
    keyboard_held: std::collections::BTreeMap<(String, u8), ()>,
}

impl ProjectView {
    pub fn receive(&mut self, json: &str) -> Result<(), serde_json::Error> {
        let next: ViewSnapshot = serde_json::from_str(json)?;
        let removed: Vec<_> = self.keyboard_held.keys().filter(|(owner, _)| {
            !next.components.iter().any(|c| c.kind == "keyboard"
                && owner.starts_with(&format!("egui:{}:", c.id)))
        }).cloned().collect();
        for (owner, note) in removed { self.note(&owner, note, false); }
        self.state = next;
        if let Some(ctx) = &self.repaint {
            ctx.request_repaint();
        }
        Ok(())
    }
    fn parameter(&self, path: &str) -> Option<Parameter> {
        self.state
            .parameters
            .iter()
            .find(|p| p.path == path)
            .cloned()
    }
    fn change(&mut self, path: &str, value: f64) {
        let operation = self.parameter(path).filter(|p| !p.operation.is_empty())
            .map(|p| p.operation).unwrap_or_else(|| "parameter.set".into());
        self.commands
            .push(serde_json::json!({"operation":operation, "path":path,
            "value":value, "origin":"egui"}));
        if let Some(p) = self.state.parameters.iter_mut().find(|p| p.path == path) {
            p.value = value;
        }
    }
    fn response(&mut self, ui: &mut egui::Ui, base: &str) {
        let cutoff_path = format!("{base}/cutoff");
        let resonance_path = format!("{base}/resonance");
        let Some(cutoff) = self.parameter(&cutoff_path) else {
            return;
        };
        let Some(resonance) = self.parameter(&resonance_path) else {
            return;
        };
        let mode = self
            .parameter(&format!("{base}/type"))
            .map_or(0, |p| p.value as u32);
        let (rect, response) = ui.allocate_exact_size(
            Vec2::new(ui.available_width(), 190.0),
            Sense::click_and_drag(),
        );
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, 4.0, Color32::from_rgb(13, 20, 32));
        let x_of = |hz: f64| {
            rect.left()
                + ((hz.ln() - 80_f64.ln()) / (16000_f64.ln() - 80_f64.ln())) as f32 * rect.width()
        };
        for hz in [100.0, 500.0, 1000.0, 5000.0, 10000.0] {
            painter.line_segment(
                [
                    Pos2::new(x_of(hz), rect.top()),
                    Pos2::new(x_of(hz), rect.bottom()),
                ],
                Stroke::new(1.0, Color32::from_rgb(26, 26, 58)),
            );
        }
        let colour = [
            Color32::from_rgb(167, 139, 250),
            Color32::from_rgb(56, 189, 248),
            Color32::from_rgb(251, 113, 133),
            Color32::from_rgb(74, 222, 128),
        ][mode.min(3) as usize];
        let y_of = |m: f64| {
            rect.center().y
                - (20.0 * (m + 1e-10).log10()).clamp(-14.0, 14.0) as f32 / 14.0
                    * rect.height()
                    * 0.45
        };
        for db in [-24., -12., 0., 12., 24.] {
            let y = rect.center().y - db / 14. * rect.height() * 0.45;
            if y >= rect.top() && y <= rect.bottom() {
                painter.line_segment(
                    [Pos2::new(rect.left(), y), Pos2::new(rect.right(), y)],
                    Stroke::new(1., Color32::from_rgb(26, 26, 58)),
                );
            }
        }
        let points: Vec<Pos2> = (0..=200)
            .map(|i| {
                let hz = (80_f64.ln() + i as f64 / 200.0 * (16000_f64.ln() - 80_f64.ln()))
                    .exp()
                    .clamp(cutoff.value * 0.25, cutoff.value * 4.0);
                let r = hz / cutoff.value;
                let q = (resonance.value * 2.0).max(0.5);
                let d = ((1.0 - r * r).powi(2) + (r / q).powi(2)).max(1e-10).sqrt();
                let magnitude = match mode {
                    0 => 1.0 / d,
                    1 => r / q / d,
                    2 => r * r / d,
                    _ => (1.0 - r * r).abs() / d,
                };
                Pos2::new(
                    rect.left() + i as f32 / 200.0 * rect.width(),
                    y_of(magnitude),
                )
            })
            .collect();
        let fill = Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 51);
        for point in &points {
            painter.line_segment(
                [*point, Pos2::new(point.x, rect.center().y)],
                Stroke::new(1., fill),
            );
        }
        painter.add(egui::Shape::line(points, Stroke::new(2.0, colour)));
        painter.line_segment(
            [
                Pos2::new(x_of(cutoff.value), rect.top()),
                Pos2::new(x_of(cutoff.value), rect.bottom()),
            ],
            Stroke::new(
                1.0,
                Color32::from_rgba_unmultiplied(colour.r(), colour.g(), colour.b(), 102),
            ),
        );
        let q = (resonance.value * 2.).max(0.5);
        let peak = match mode {
            0 | 2 => q,
            1 => 1.,
            _ => 0.,
        };
        painter.circle_filled(
            Pos2::new(x_of(cutoff.value), y_of(peak)),
            5.,
            Color32::WHITE,
        );
        painter.text(
            rect.left_top() + Vec2::new(4., 4.),
            egui::Align2::LEFT_TOP,
            "FILTER",
            egui::FontId::proportional(11.),
            colour,
        );
        if (response.dragged() || response.drag_stopped() || response.clicked())
            && let Some(pos) = response.interact_pointer_pos()
        {
            let x = ((pos.x - rect.left()) / rect.width()).clamp(0.0, 1.0) as f64;
            let y = ((pos.y - rect.top()) / rect.height()).clamp(0.0, 1.0) as f64;
            self.change(
                &cutoff_path,
                (80_f64.ln() + x * (16000_f64.ln() - 80_f64.ln()))
                    .exp()
                    .round(),
            );
            self.change(
                &resonance_path,
                ((0.1 + (1.0 - y) * 1.9) * 100.0).round() / 100.0,
            );
        }
    }
    pub fn draw(&mut self, ui: &mut egui::Ui) {
        let components = self.state.components.clone();
        egui::Frame::new()
            .fill(Color32::from_rgb(20, 24, 43))
            .stroke(Stroke::new(1., Color32::from_rgb(53, 67, 94)))
            .corner_radius(8.)
            .inner_margin(12.)
            .show(ui, |ui| {
                ui.spacing_mut().item_spacing = Vec2::new(12., 12.);
                if components
                    .iter()
                    .any(|component| component.kind == "filter-response")
                {
                    ui.columns(2, |columns| {
                        for component in &components {
                            let index = usize::from(component.kind != "filter-response");
                            self.draw_component(&mut columns[index], component);
                        }
                    });
                } else if components.iter().any(|c| !c.group.is_empty()) {
                    let mut groups = Vec::<String>::new();
                    for c in &components {
                        if !groups.contains(&c.group) { groups.push(c.group.clone()); }
                    }
                    for group in groups.iter().filter(|group| components.iter().filter(|c|&c.group==*group).all(|c|c.kind=="curve")) {
                        ui.label(egui::RichText::new(group).color(heading_color(&components, group)));
                        let curves:Vec<_>=components.iter().filter(|c|&c.group==group).collect();
                        if curves.len()==1{self.draw_component(ui,curves[0]);}else{for row in curves.chunks(2){ui.columns(2,|columns|{for (index,curve) in row.iter().enumerate(){self.draw_component(&mut columns[index],curve);}});}}
                        ui.add_space(12.);
                    }
                    let regular:Vec<_>=groups.iter().filter(|group|
                        !components.iter().any(|c|&c.group==*group&&c.kind=="keyboard")
                        && !components.iter().filter(|c|&c.group==*group).all(|c|c.kind=="curve")
                    ).collect();
                    for row in regular.chunks(2) {
                        ui.columns(2, |columns| {
                            for (index, group) in row.iter().enumerate() {
                                columns[index].label(egui::RichText::new(*group).color(heading_color(&components, group)));
                                for c in components.iter().filter(|c| &c.group == *group) {
                                    self.draw_component(&mut columns[index], c);
                                }
                            }
                        });
                        ui.add_space(12.);
                    }
                    for c in components.iter().filter(|c| c.kind=="keyboard") {
                        ui.label(egui::RichText::new(&c.group).color(heading_color(&components, &c.group)));
                        self.draw_component(ui,c);
                    }
                } else {
                    for component in &components {
                        self.draw_component(ui, component);
                    }
                }
            });
    }

    fn note(&mut self, owner: &str, note: u8, on: bool) {
        let key = (owner.to_owned(), note);
        if on {
            if self.keyboard_held.insert(key, ()).is_some() { return; }
        } else if self.keyboard_held.remove(&key).is_none() { return; }
        self.commands.push(serde_json::json!({"operation":"event.send","origin":"egui",
            "event":{"type":if on {"note-on"}else{"note-off"},"note":note,"velocity":100,"owner":owner}}));
    }
    fn keyboard(&mut self, ui: &mut egui::Ui, component: &Component) {
        let first = component.first_note.unwrap_or(48);
        let count = component.note_count.unwrap_or(25).min(49);
        let owner = format!("egui:{}", component.id);
        ui.horizontal(|ui| {
            ui.small("Focus keyboard · A W S E D F T G Y H U J");
            if ui.button("Release all notes").clicked() {
                self.keyboard_held.clear();
                self.commands.push(serde_json::json!({"operation":"event.send","origin":"egui","event":{"type":"panic"}}));
            }
        });
        let (rect, response) = ui.allocate_exact_size(Vec2::new(ui.available_width(),110.),Sense::click_and_drag());
        let width = rect.width() / f32::from(count);
        if response.clicked() {
            response.request_focus();
            if !ui.input(|i| i.pointer.primary_down()) && let Some(position) = response.interact_pointer_pos() {
                let note = first.saturating_add(((position.x-rect.left())/width).floor().clamp(0.,f32::from(count-1)) as u8);
                let pointer_owner = format!("{owner}:pointer");
                self.note(&pointer_owner, note, true);
                self.note(&pointer_owner, note, false);
            }
        }
        let painter = ui.painter();
        for index in 0..count {
            let note = first.saturating_add(index);
            let sharp = matches!(note % 12, 1|3|6|8|10);
            let key_rect = egui::Rect::from_min_size(rect.min+Vec2::new(width*f32::from(index),0.),Vec2::new(width-1.,if sharp {74.}else{110.}));
            let active = component.active_notes.contains(&note);
            painter.rect_filled(key_rect,2.,if active {Color32::from_rgb(167,139,250)}else if sharp {Color32::from_rgb(23,32,52)}else{Color32::from_rgb(213,220,231)});
            if note % 12 == 0 {
                painter.text(key_rect.center_bottom()-Vec2::new(0.,8.),egui::Align2::CENTER_BOTTOM,format!("C{}",i16::from(note)/12-1),egui::FontId::proportional(9.),Color32::from_rgb(23,32,52));
            }
        }
        if (response.is_pointer_button_down_on() || response.dragged()) && let Some(position) = response.interact_pointer_pos() {
            response.request_focus();
            let note = first.saturating_add(((position.x-rect.left())/width).floor().clamp(0.,f32::from(count-1)) as u8);
            let pointer_owner = format!("{owner}:pointer");
            let released:Vec<_>=self.keyboard_held.keys().filter(|(o,n)|o==&pointer_owner&&*n!=note).cloned().collect();
            for (o,n) in released { self.note(&o,n,false); }
            self.note(&pointer_owner,note,true);
        }
        if !ui.input(|i|i.pointer.primary_down()) {
            let pointer_owner = format!("{owner}:pointer");
            let released:Vec<_>=self.keyboard_held.keys().filter(|(o,_)|o==&pointer_owner).cloned().collect();
            for (o,n) in released { self.note(&o,n,false); }
        }
        let mapping=[egui::Key::A,egui::Key::W,egui::Key::S,egui::Key::E,egui::Key::D,egui::Key::F,egui::Key::T,egui::Key::G,egui::Key::Y,egui::Key::H,egui::Key::U,egui::Key::J,egui::Key::K,egui::Key::O,egui::Key::L,egui::Key::P,egui::Key::Semicolon];
        let keys_owner = format!("{owner}:keys");
        for (index,key) in mapping.into_iter().enumerate().take(count as usize) {
            let note=first.saturating_add(index as u8);
            if response.has_focus() && ui.input(|i|i.key_pressed(key)&&!i.modifiers.command&&!i.modifiers.alt) { self.note(&keys_owner,note,true); }
            if ui.input(|i|i.key_released(key)) || !response.has_focus() { self.note(&keys_owner,note,false); }
        }
        if !ui.input(|i|i.focused) {
            let released:Vec<_>=self.keyboard_held.keys().cloned().collect();
            for (o,n) in released { self.note(&o,n,false); }
        }
    }
    /// Draw one presentation component. Hosts that compose their own layout
    /// around the shared controls, such as Studio, call this per component.
    pub fn draw_component(&mut self, ui: &mut egui::Ui, component: &Component) {
        ui.push_id(&component.id, |ui| ui.scope(|ui| match component.kind.as_str() {
            "curve" => {
                let (rect,_)=ui.allocate_exact_size(Vec2::new(ui.available_width(),component.height.unwrap_or(132.).clamp(64.,320.)),Sense::hover());
                let painter=ui.painter_at(rect);painter.rect_filled(rect,6.,color(&component.style.background, Color32::from_rgb(13,20,32)));
                for i in 1..4{let y=rect.top()+rect.height()*i as f32/4.;painter.line_segment([Pos2::new(rect.left(),y),Pos2::new(rect.right(),y)],Stroke::new(1.,Color32::from_rgb(26,26,58)));}
                let accent=color(&component.color, color(&component.style.accent, Color32::from_rgb(167,139,250)));
                let points=component.points.iter().take(1024).map(|p|Pos2::new(rect.left()+p[0]*rect.width(),rect.top()+p[1]*rect.height())).collect();
                painter.add(egui::Shape::line(points,Stroke::new(1.,accent)));
                painter.text(rect.left_top()+Vec2::new(4.,2.),egui::Align2::LEFT_TOP,&component.label,egui::FontId::proportional(11.),color(&component.style.text, accent));
            }
            "label" => {
                egui::Frame::new().fill(color(&component.style.background, Color32::TRANSPARENT)).show(ui, |ui| {
                    ui.set_min_width(ui.available_width());
                    ui.with_layout(egui::Layout::top_down(egui::Align::Min), |ui| ui.label(egui::RichText::new(&component.label)
                        .color(color(&component.style.text, color(&component.style.accent, ui.visuals().text_color())))
                        .size(component.font_size.unwrap_or(14.).clamp(10.,32.))));
                });
            }
            "filter-response" => self.response(ui, &component.base),
            "keyboard" => self.keyboard(ui, component),
            "parameter" | "control" => {
                let Some(parameter) = self.parameter(&component.path) else {
                    return;
                };
                let mut value = parameter.value;
                if !component.choices.is_empty() {
                    let visuals = ui.visuals_mut();
                    visuals.override_text_color = Some(color(&component.style.text, Color32::from_rgb(218,225,240)));
                    visuals.widgets.inactive.bg_fill = color(&component.style.background, visuals.widgets.inactive.bg_fill);
                    visuals.widgets.inactive.weak_bg_fill = color(&component.style.background, visuals.widgets.inactive.weak_bg_fill);
                    visuals.widgets.inactive.bg_stroke.color = color(&component.style.accent, visuals.widgets.inactive.bg_stroke.color);
                    visuals.selection.bg_fill = color(&component.style.accent, visuals.selection.bg_fill);
                    let choice_value = |index: usize| component.choice_values.get(index).copied().unwrap_or(index as f64);
                    let choices = |ui: &mut egui::Ui, value: &mut f64| {
                            for (index, choice) in component.choices.iter().enumerate() {
                                if ui
                                    .add_enabled(
                                        !component.disabled_choices.contains(&index),
                                        egui::Button::selectable(*value == choice_value(index), choice),
                                    )
                                    .clicked()
                                {
                                    *value = choice_value(index);
                                }
                            }
                    };
                    if component.inline_choices {
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 2.;
                            choices(ui, &mut value);
                        });
                    } else {
                        let combo = egui::ComboBox::from_id_salt(&component.id)
                            .width(ui.available_width())
                            .selected_text(
                                component
                                    .choices
                                    .get((0..component.choices.len()).find(|&index| choice_value(index) == value).unwrap_or(usize::MAX))
                                    .cloned()
                                    .unwrap_or_default(),
                            )
                            .show_ui(ui, |ui| choices(ui, &mut value));
                        let rect = combo.response.rect;
                        self.control_geometry.push(serde_json::json!({"path":component.path,
                            "kind":"choice","rect":[rect.min.x,rect.min.y,rect.width(),rect.height()],
                            "value":value,"choices":component.choices,"choiceValues":component.choice_values}));
                    }
                } else {
                    // Port of the kit's compact slider: linear horizontal
                    // mapping, full-width fill and separate label/value.
                    let (rect, response) = ui.allocate_exact_size(
                        Vec2::new(ui.available_width(), 24.0),
                        Sense::click_and_drag(),
                    );
                    if (response.is_pointer_button_down_on() || response.dragged() || response.drag_stopped() || response.clicked())
                        && let Some(pos) = response.interact_pointer_pos()
                    {
                        response.request_focus();
                        let t = ((pos.x - rect.left()) / rect.width()).clamp(0.0, 1.0) as f64;
                        value = parameter.min + t * (parameter.max - parameter.min);
                        if parameter.discrete { value = value.round(); }
                    }
                    if response.double_clicked() {
                        value = parameter.default;
                    }
                    if response.has_focus() {
                        let delta = ui.input(|i| {
                            f64::from(
                                (i.key_pressed(egui::Key::ArrowRight)
                                    || i.key_pressed(egui::Key::ArrowUp))
                                    as u8,
                            ) - f64::from(
                                (i.key_pressed(egui::Key::ArrowLeft)
                                    || i.key_pressed(egui::Key::ArrowDown))
                                    as u8,
                            )
                        });
                        value += delta * if parameter.discrete || parameter.max > 100.0 { 1.0 } else { 0.01 };
                        if ui.input(|i| i.key_pressed(egui::Key::Home)) {
                            value = parameter.min;
                        }
                        if ui.input(|i| i.key_pressed(egui::Key::End)) {
                            value = parameter.max;
                        }
                    }
                    value = value.clamp(parameter.min, parameter.max);
                    let painter = ui.painter();
                    painter.rect_filled(rect, 2.0, color(&component.style.background, Color32::from_rgb(30, 27, 51)));
                    let t =
                        ((value - parameter.min) / (parameter.max - parameter.min)).clamp(0.0, 1.0);
                    let fill = egui::Rect::from_min_size(
                        rect.min,
                        Vec2::new(rect.width() * t as f32, rect.height()),
                    );
                    painter.rect_filled(fill, 2.0, color(&component.style.accent, Color32::from_rgb(125, 97, 186)));
                    let formatted = if parameter.max > 100.0 {
                        format!("{value:.0}")
                    } else {
                        format!("{value:.2}")
                    };
                    let text_color = color(&component.style.text, Color32::WHITE);
                    let font = egui::FontId::proportional(12.0);
                    let value_width = painter.layout_no_wrap(formatted.clone(), font.clone(), text_color).size().x;
                    let mut label = egui::text::LayoutJob::simple_singleline(component.label.clone(), font, text_color);
                    label.wrap.max_width = (rect.width() - value_width - 20.).max(0.);
                    label.wrap.max_rows = 1;
                    label.wrap.break_anywhere = true;
                    let label = painter.layout_job(label);
                    painter.galley(rect.left_center() + Vec2::new(6., -label.size().y / 2.), label, text_color);
                    painter.text(
                        rect.right_center() - Vec2::new(6.0, 0.0),
                        egui::Align2::RIGHT_CENTER,
                        formatted,
                        egui::FontId::proportional(12.0),
                        color(&component.style.text, Color32::WHITE),
                    );
                    self.control_geometry.push(serde_json::json!({"path":component.path,
                        "rect":[rect.min.x,rect.min.y,rect.width(),rect.height()],"value":value}));
                }
                if value != parameter.value {
                    self.change(&component.path, value);
                }
            }
            _ => {}
        }));
    }
}

impl eframe::App for ProjectView {
    #[cfg(target_arch = "wasm32")]
    fn as_any_mut(&mut self) -> Option<&mut dyn std::any::Any> {
        Some(self)
    }
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.control_geometry.clear();
        self.repaint = Some(ui.ctx().clone());
        ui.ctx().set_theme(egui::Theme::Dark);
        ui.visuals_mut().clone_from(&egui::Visuals::dark());
        ui.visuals_mut().override_text_color = Some(Color32::from_rgb(218, 225, 240));
        ui.painter()
            .rect_filled(ui.max_rect(), 0.0, Color32::from_rgb(11, 17, 27));
        egui::ScrollArea::vertical().show(ui, |ui| self.draw(ui));
    }
}

#[cfg(target_arch = "wasm32")]
mod web {
    use super::*;
    use wasm_bindgen::prelude::*;
    #[wasm_bindgen]
    pub struct ManifoldView {
        runner: eframe::WebRunner,
    }
    #[wasm_bindgen]
    impl ManifoldView {
        #[wasm_bindgen(constructor)]
        pub fn new() -> Self {
            Self {
                runner: eframe::WebRunner::new(),
            }
        }
        pub async fn start(&self, canvas: web_sys::HtmlCanvasElement) -> Result<(), JsValue> {
            self.runner
                .start(
                    canvas,
                    eframe::WebOptions::default(),
                    Box::new(|cc| {
                        cc.egui_ctx.set_theme(egui::Theme::Dark);
                        Ok(Box::<ProjectView>::default())
                    }),
                )
                .await
        }
        pub fn receive(&self, json: &str) -> Result<(), JsValue> {
            if let Some(mut app) = self.runner.app_mut::<ProjectView>() {
                app.receive(json)
                    .map_err(|e| JsValue::from_str(&e.to_string()))?;
            }
            Ok(())
        }
        pub fn drain(&self) -> String {
            self.runner
                .app_mut::<ProjectView>()
                .map(|mut app| {
                    let commands = std::mem::take(&mut app.commands);
                    serde_json::to_string(&commands).unwrap()
                })
                .unwrap_or_else(|| "[]".into())
        }
        pub fn destroy(&self) {
            self.runner.destroy();
        }
        pub fn panic_message(&self) -> String {
            self.runner
                .panic_summary()
                .map(|p| p.message())
                .unwrap_or_default()
        }
    }
}

#[cfg(test)]
mod interaction_tests {
    use super::*;

    #[test]
    fn continuous_control_paints_current_pointer_without_rounding_or_waiting() {
        let context = egui::Context::default();
        let mut view = ProjectView::default();
        let component = Component { id:"gain".into(),kind:"parameter".into(),path:"/gain".into(), ..Default::default() };
        view.state.parameters.push(Parameter {path:"/gain".into(),max:1.,..Default::default()});
        let mut frame = |events| {
            view.control_geometry.clear();
            let mut output = context.run_ui(egui::RawInput {
                screen_rect:Some(egui::Rect::from_min_size(Pos2::ZERO,Vec2::new(400.,100.))),
                events, ..Default::default()
            }, |ui| { egui::CentralPanel::default().show(ui, |ui| view.draw_component(ui,&component)); });
            output.textures_delta.clear();
            view.control_geometry.last().unwrap().clone()
        };
        let initial = frame(vec![]);
        let rect = &initial["rect"];
        let x = rect[0].as_f64().unwrap() as f32;
        let y = rect[1].as_f64().unwrap() as f32 + 12.;
        let width = rect[2].as_f64().unwrap() as f32;
        let start = Pos2::new(x+width*0.2,y);
        let pressed = frame(vec![egui::Event::PointerMoved(start),egui::Event::PointerButton {
            pos:start,button:egui::PointerButton::Primary,pressed:true,modifiers:Default::default()
        }]);
        assert!((pressed["value"].as_f64().unwrap()-0.2).abs()<0.00001, "pointer-down paints immediately");
        for fraction in [0.3154,0.4963,0.7048] {
            let current=frame(vec![egui::Event::PointerMoved(Pos2::new(x+width*fraction,y))]);
            assert!((current["value"].as_f64().unwrap()-fraction as f64).abs()<0.00001,
                "the fill and number must paint this pointer position in the same frame");
        }
    }
}
