//! macOS: a mouse's dedicated back / forward side buttons (X1/X2), read from
//! AppKit rather than from the DOM.
//!
//! The frontend has always mapped `MouseEvent.button === 3 / 4` to
//! `nav.back` / `nav.forward` (`routes/(main)/mouse-nav.ts`), which is what
//! Chromium-based webviews deliver. On macOS that path doesn't fire: a five-button
//! mouse's side buttons produce no `button === 3 / 4` in WKWebView (reported
//! against a Logitech MX Master 4, macOS 27, 2026-09-04; the DOM path stays as
//! the Linux/WebKitGTK route). AppKit sees them either way — an `NSEvent` local
//! monitor gets `otherMouseDown` / `otherMouseUp` carrying the authoritative
//! `buttonNumber` — so on macOS this module is the source of truth and emits
//! `mouse-nav` to the main window, which dispatches the same bus command as
//! `⌘[` / `⌘]`.
//!
//! ## Why the monitor swallows the events it recognizes
//!
//! Returning `null` from the handler drops the event before any window sees it.
//! That's deliberate: WebKit's mapping of extra mouse buttons onto the DOM's
//! three-button vocabulary is not something we control, and Cmdr gives the
//! MIDDLE button real gestures (close a tab, open a folder in a background tab).
//! An X1 press that arrived as a middle click would close whatever it happened
//! to be over. Only buttons 3 and 4 are swallowed; every other `otherMouse`
//! event (the middle button included) is handed straight back.
//!
//! The monitor is LOCAL, so it only sees events already destined for this app —
//! no accessibility permission, and nothing observed while another app is front.

use std::ptr::NonNull;

use log::{debug, warn};
use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventType};
use tauri::{AppHandle, Manager, Runtime};
use tauri_specta::Event as _;

use crate::window_events::{MouseNav, MouseNavDirection};

/// Fourth mouse button (X1), conventionally "back". Same numbering the UI Events
/// spec gives `MouseEvent.button`, which is why the two sides agree.
const BUTTON_BACK: isize = 3;

/// Fifth mouse button (X2), conventionally "forward".
const BUTTON_FORWARD: isize = 4;

/// The only window a pane-history walk means anything in.
const MAIN_WINDOW_LABEL: &str = "main";

/// The history direction a side button drives, or `None` for a button we don't
/// own (the middle button, and anything past the fifth).
fn direction_for(button_number: isize) -> Option<MouseNavDirection> {
    match button_number {
        BUTTON_BACK => Some(MouseNavDirection::Back),
        BUTTON_FORWARD => Some(MouseNavDirection::Forward),
        _ => None,
    }
}

/// Installs the local `NSEvent` monitor. Call once, from the Tauri setup hook.
///
/// The monitor lives for the whole session: there's no teardown point, and the
/// buttons should work for as long as the app is up. Same shape as the
/// notification observers in `accent_color.rs` / `reduce_transparency.rs`.
pub fn install<R: Runtime>(app_handle: AppHandle<R>) {
    // Compile-time proof of the AppKit main thread; `addLocalMonitor…` is an
    // AppKit call, and the setup hook is where we are.
    let _mtm = MainThreadMarker::new().expect("install runs on the main thread (Tauri setup hook)");

    let block = block2::RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        // SAFETY: AppKit passes the monitor a live `NSEvent` that stays valid for
        // the duration of the callback, and we only read from it here.
        let ns_event = unsafe { event.as_ref() };

        let Some(direction) = direction_for(ns_event.buttonNumber()) else {
            return event.as_ptr(); // not ours: hand it back untouched
        };

        // The buttons stay inert unless the main window is the one being clicked
        // in; a settings or viewer window has no pane history to walk, and
        // swallowing there would eat an event its own webview might want.
        // (`Manager::get_focused_window` would say this directly, but it's behind
        // Tauri's `unstable` feature, so ask the main window itself.)
        let focused_is_main = app_handle
            .get_webview_window(MAIN_WINDOW_LABEL)
            .and_then(|window| window.is_focused().ok())
            .unwrap_or(false);
        if !focused_is_main {
            return event.as_ptr();
        }

        // Navigate on the UP edge (the press is only swallowed), mirroring the
        // DOM path and every other click gesture in the app.
        if ns_event.r#type() == NSEventType::OtherMouseUp {
            debug!(target: "mouse_nav", "Side button {:?}", direction);
            if let Err(e) = (MouseNav { direction }).emit_to(&app_handle, MAIN_WINDOW_LABEL) {
                warn!(target: "mouse_nav", "Couldn't emit mouse-nav: {e}");
            }
        }
        std::ptr::null_mut()
    });

    // SAFETY: `block` is a live `RcBlock` with the
    // `(NonNull<NSEvent>) -> *mut NSEvent` signature the handler parameter
    // declares, and AppKit copies it. The mask covers only the two `otherMouse`
    // event types the handler inspects.
    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(
            NSEventMask::OtherMouseDown | NSEventMask::OtherMouseUp,
            &block,
        )
    };

    match monitor {
        // Leaking the monitor token is what keeps it installed: dropping the
        // `Retained` would release it and the buttons would go dead. There's no
        // point in the app's life where we'd want to remove it.
        Some(monitor) => {
            let _installed = Retained::into_raw(monitor);
            debug!(target: "mouse_nav", "Side-button monitor installed");
        }
        None => warn!(
            target: "mouse_nav",
            "AppKit refused the side-button event monitor; the mouse's back / forward buttons won't navigate"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_only_the_two_side_buttons() {
        assert_eq!(direction_for(BUTTON_BACK), Some(MouseNavDirection::Back));
        assert_eq!(direction_for(BUTTON_FORWARD), Some(MouseNavDirection::Forward));
    }

    #[test]
    fn leaves_every_other_button_alone() {
        // 2 is the middle button, which Cmdr's own gestures use.
        for button in [0, 1, 2, 5, 6] {
            assert_eq!(direction_for(button), None, "button {button} should not navigate");
        }
    }
}
