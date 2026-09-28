# Personal branch of Niri

Personal branch of my [niri fork](https://github.com/suif4599/niri-brightness) for miscellaneous unpublished features

## Features

### Per-device window-rule scroll factor

```kdl
window-rule {
    match app-id="google-chrome"

    // Slow down touchpad scrolling only, keep the mouse wheel as-is.
    scroll-factor touchpad=0.5
}
```

## License

This project is distributed under the [GNU General Public License v3](LICENSE)
