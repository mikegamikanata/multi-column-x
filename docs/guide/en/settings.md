# Settings

## App-wide settings

Click the **Settings** (gear icon) button on the toolbar (`Ctrl+,`) to open the app-wide settings. Choose a category in the navigation on the left to switch to that category's page (it always opens on "Display").

| Group             | Category           | Contents                                                                                  | Availability                    |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------------- | ------------------------------- |
| General           | Display            | Language, theme and display size, API usage monitor                                       | All                             |
| General           | Browsing & filters | X official settings, global muted words, users whose reposts are hidden, ads, Grok button | All                             |
| General           | Media              | Video, popup windows, video playback (Linux)                                              | All (items vary by environment) |
| General           | Column defaults    | Initial settings for new columns, and applying them to existing columns                   | All                             |
| General           | Android            | Posting, swipe switching, multi-column view                                               | Android only                    |
| Columns           | Column layout      | Column placement and order ([grid layout](./columns#grid-layout-advanced))                | All                             |
| Columns           | Presets            | Save and load layouts                                                                     | Desktop only                    |
| Data & extensions | Extensions         | Add and manage Chrome / Edge extensions                                                   | Windows only                    |
| Data & extensions | Backup             | Export and restore your settings and column setup                                         | All                             |
| App               | Maintenance        | Recreate WebViews, delete data folders                                                    | All                             |
| App               | About              | Current version and update check                                                          | All                             |

Differences between environments are also summarized in [Supported Environments and Features](./environments).

![App settings: Display category](../images/app-settings-general.png)

_Switch categories with the navigation on the left. "Display" lets you configure the app UI display size, the display size inside columns, the theme, and more. (The screenshot shows the Japanese UI.)_

### Applying settings and the unapplied mark

The five categories "Display", "Browsing & filters", "Media", "Column defaults", and "Android" share a single draft. Changes you make across these categories are saved together when you press **"Apply"** at the bottom (**"Cancel"** discards them and closes). A category that has changes you have not applied yet gets a mark (●) in the navigation; the mark disappears if you set the value back.

If a muted-words or hidden-repost-users field has an input error, the settings cannot be applied, and the view switches to "Browsing & filters" and shows the error.

If you try to close with **✕** in the header, the Esc key, or **"Close"** while there are unapplied changes, a confirmation "You have unapplied changes" appears. **"Discard and close"** throws the changes away and closes; **"Back"** returns to the settings with your edits intact. **"Cancel"** discards the changes and closes without asking.

For the other categories (Column layout, Presets, Extensions, Backup, Maintenance, About), the only button at the bottom is **"Close"**. Column layout is applied with the **"Apply"** button on the page itself; the others take effect as soon as you use them.

On Android, a list of categories (grouped, with a short description for each) is shown first, and tapping a category opens its detail screen. On a detail screen, you can go back to the list with the back button in the header or with the device's back gesture or button (your edits are kept).

### Display

- **Language** — The language of the app's screens.
- **App UI display size** — The size of the app itself, such as the toolbar and the settings screens. The default is "Match device" (on Android it follows the device's font size setting). You can also fix it to "Small / Standard / Large / Extra large" (check "Change the app UI display size" to enable the selection). This is separate from the size of the content inside columns.
- **Display size inside columns** — Choose the zoom level inside columns (the x.com display) from "Small / Standard / Normal / Large / Extra large" (check "Change the display size inside columns" to enable the selection).
- **Theme** — Choose from "Dark / Light / System" (check "Change the theme" to enable the selection).
- **API usage monitor** — Whether to enable the API button on the toolbar (which shows API rate limits).

### Browsing & filters

- **X official settings** — **"Open official settings"** opens X's official settings screen in a popup window. With the **"Apply to each column"** button on that screen, you can apply those settings to the columns of your other accounts.
- **Global muted words** — Muted words applied to all columns (used together with each column's own muted words). You can also write them in the `/regex/` format.
- **Users whose reposts are hidden** — Hides posts reposted by the specified users (one user ID per line) in all columns (used together with each column's own setting).
- **Ads** — Whether to hide ads.
- **Grok** — Whether to hide the Grok button on each post. Grok-related UI outside of posts, such as the Grok entry in the left sidebar, is not affected.

### Media

- **Video** — Whether to stop videos from autoplaying.
- **Popup windows** (desktop only) — Whether to close with the Esc key, and whether to open images and videos in a popup window.
- **Video playback (Linux)** (Linux only) — Toggles **"Use hardware decoding (VA-API)"**. In the AppImage version, **"Enable H.264"** gets the decoder needed to play videos. Both take effect only after a restart (a "Restart now" button appears).

### Column defaults

Set the initial values for newly added columns. The headings are the same as in the column settings (auto-reload, display, images, image blur, and custom CSS).

- The **"Apply to all existing columns"** button at the top of the page applies the defaults you are editing to every existing column (the page explains what is covered).

### Android

Shown only on Android. It includes items such as "Launch the X app with the post button", "Enable swiping to switch columns", and "Show multiple columns on wide screens (tablet / landscape)" ([Using on Android](./android)).

### Maintenance

- **WebView** — **"Recreate all WebViews"** recreates all columns in turn (your settings are kept; use it to recover when the display is broken).
- **Delete data folders** — Shown only when data folders that could not be deleted remain (deletion is also attempted automatically at the next launch). **"Retry deleting data folders"** retries the deletion.

### About

Shows the current version and the **"Check for updates"** button ([Updating the App](./update)). The result is shown on the same page.

## Presets (advanced)

> Presets are a desktop feature.

Save your current column setup (layout) under a name and load it all at once later. This is handy when you want to switch layouts by purpose, such as work and hobby.

1. Open App settings (`Ctrl+,`) → the **"Presets" category**.
2. Enter a name under **"Save current layout"** and press the save button.
3. Saved presets appear in the list, where you can use
   - **"Load"** … to switch to that layout.
   - **"Delete"** … to delete the preset.

![Presets category](../images/presets-tab.png)

_Save the current layout under a name, then choose "Load" or "Delete" from the list. (The screenshot shows the Japanese UI.)_

## Extensions (advanced)

> Extension management is **available on Windows only**. The "Extensions" category is not shown on other OSes or on Android.

You can load Chrome / Edge extensions (those that modify pages with content scripts, those with popups or options pages, and so on) into your columns. Added extensions work in the columns of **all accounts**.

Open App settings (`Ctrl+,`) → the **"Extensions" category**, and add an extension in either of the following ways.

- **"Detect from browser"** … Extensions installed in Chrome / Edge on your computer are listed as candidates. Each candidate shows the browser it comes from (Chrome / Edge), and if the same extension exists in both, only the Chrome one is shown. Press **"Add"** on the one you want (already-added ones show "Added"). If neither browser is found, "Chrome / Edge not found" is shown.
- **"Add from folder"** … Choose an unpacked extension folder (a folder containing `manifest.json`). Network folders and folders without a `manifest.json` cannot be added.

The add section also shows where extensions are stored. Extensions for Chromium-based browsers are usually located at `%LOCALAPPDATA%\{organization}\{browser}\User Data\Default\Extensions\<extension ID>\<version>` (Chrome is at `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions`, and Edge is at `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Extensions`). For extensions of other browsers such as Brave, or if you have changed the user data location, specify a version folder in this format with "Add from folder".

After adding, the "Added extensions" list also shows the browser each one comes from, and you can do the following.

- **Enabled** … Use the checkbox to enable or disable the extension.
- **Open popup / Open options** … Shown when the extension has a popup or an options page. It opens in a separate window.
- **Delete** … Removes the extension from the list.

When you add, delete, or enable/disable an extension, **all columns are reloaded automatically**.

![Extensions category](../images/extensions-tab.png)

_Candidates from "Detect from browser" and the list of added extensions. You can enable or disable them, show their popups and options, and delete them. (The screenshot shows the Japanese UI.)_

> **Note** — Added extensions may be able to read and modify X pages for all accounts. Only add extensions you trust.
>
> Extensions that depend on Chrome-specific features (such as `sidePanel`) may be added but have some features that do not work. In particular, extensions that detect the content of the open page and are used from a toolbar button may not work, because their popups open in a separate window. Extensions whose original folder was moved or deleted, or that were removed from Chrome / Edge, show "Not found" and are treated as disabled.

## Backup and restore (advanced)

You can export account info (names and colors), column layout, and settings to a single file and restore them later. This is handy when you change devices or want to rebuild your setup.

> **Backups do not include login information (cookies).** You need to log in to X on the destination beforehand. Also, the file contains personal information such as account names, muted words, and users whose reposts are hidden, so be careful when sharing or storing it.

### Create a backup

1. Open App settings (`Ctrl+,`) → the **"Backup" category**.
2. Press **"Export backup"** and choose where to save it (the default file name is `.mcxbackup.json`).

![Backup category](../images/backup-tab.png)

_"Create a backup" and "Restore from backup" are shown side by side. (The screenshot shows the Japanese UI.)_

### Restore from a backup

1. In the destination app, first add (log in to) accounts that correspond to the accounts in the backup.
2. In the "Backup" category, press **"Select backup file"** and choose the file.
3. **Link accounts** — For each account in the backup, choose a logged-in account on the destination. Columns of accounts set to "Don't restore" are not restored.
4. **Confirm restore** — Check the number of columns to be restored and skipped, then press **"Replace and restore"**.

![Link accounts](../images/backup-mapping.png)

_For each account in the backup, choose the account to restore to. (The screenshot shows the Japanese UI.)_

> Restoring **replaces** your current columns and settings (except window position) with the backup contents. Accounts themselves are not replaced. Your settings just before restoring are backed up automatically.
