# Personal branch of Niri

Personal branch of my [niri fork](https://github.com/suif4599/niri-brightness) for miscellaneous unpublished features

## Per-device window-rule scroll factor

```kdl
window-rule {
    match app-id="google-chrome"

    // Slow down touchpad scrolling only, keep the mouse wheel as-is.
    scroll-factor touchpad=0.5
}
```

## Maintenance

This fork is maintained in my spare time. It is synced with upstream roughly once a month, so new upstream releases may take a while to land here. If you would like an update (for example, a newer upstream release or a fix) to land sooner, feel free to open an issue to ask for it — it will be picked up whenever I have some spare time.

## License

This project is distributed under the [GNU General Public License v3](LICENSE)
