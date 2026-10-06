# Changelog

## [0.2.14](https://github.com/RAbdelrhman/wayfinder-map/compare/v0.2.13...v0.2.14) (2026-10-06)


### Features

* add round 2 R-C filter remix and record round 1 picks ([#223](https://github.com/RAbdelrhman/wayfinder-map/issues/223)) ([f83567a](https://github.com/RAbdelrhman/wayfinder-map/commit/f83567a8081e10a599a3a935d040c7b75fa9b6d7))
* match phone top-bar buttons to the desktop app ([#223](https://github.com/RAbdelrhman/wayfinder-map/issues/223)) ([2727ca6](https://github.com/RAbdelrhman/wayfinder-map/commit/2727ca6760c521ed0f521d0eb5a3ec0918dd56f8))
* move global preferences to a dedicated Settings page ([#262](https://github.com/RAbdelrhman/wayfinder-map/issues/262)) ([284fb07](https://github.com/RAbdelrhman/wayfinder-map/commit/284fb07ae7491f1e06c293606944ae30d022c1ac))
* prototype following a map on a phone ([#223](https://github.com/RAbdelrhman/wayfinder-map/issues/223)) ([d9be136](https://github.com/RAbdelrhman/wayfinder-map/commit/d9be13612a0179ed7c0f71f78161541c8659bec4))
* prototype following a map on a phone ([#223](https://github.com/RAbdelrhman/wayfinder-map/issues/223)) ([a02dceb](https://github.com/RAbdelrhman/wayfinder-map/commit/a02dceb2a6b1320212046af0a33a3c3d90d1f5e8))
* scaffold the Expo app in mobile/ with shared map code ([cb3f63e](https://github.com/RAbdelrhman/wayfinder-map/commit/cb3f63e95d3fd2b26c6c49f8c4ac45e669289791))
* unify needs-you alerts and map activity in one inbox ([5e98ced](https://github.com/RAbdelrhman/wayfinder-map/commit/5e98ced8654cc4aa0d2520fa89cf7e3fd08d8c95))
* unify needs-you alerts and map activity in one inbox ([088a1ec](https://github.com/RAbdelrhman/wayfinder-map/commit/088a1ec51853ccacdfc77bb6e6c543b5fbc9ad1f))


### Bug Fixes

* open only sample-data maps, 44px filter chips, literal frame src ([#223](https://github.com/RAbdelrhman/wayfinder-map/issues/223)) ([28303fd](https://github.com/RAbdelrhman/wayfinder-map/commit/28303fdabed7d4e04725bdbc04c21997ab21232c))
* preserve inbox alerts and unread state across updates ([81f7e32](https://github.com/RAbdelrhman/wayfinder-map/commit/81f7e32631507a7f98b3419cd6d37f53e8236e08))
* render inbox rows through safe DOM nodes ([12af02c](https://github.com/RAbdelrhman/wayfinder-map/commit/12af02c534f250b4b1f1d05cee693ca51647081f))

## [0.2.13](https://github.com/RAbdelrhman/wayfinder-map/compare/v0.2.12...v0.2.13) (2026-10-05)


### Features

* add round 2 A+C remix to the canvas viewer prototype ([#207](https://github.com/RAbdelrhman/wayfinder-map/issues/207)) ([ebdf915](https://github.com/RAbdelrhman/wayfinder-map/commit/ebdf91532e7a4cdb210621cd0e43d65c9e1912d9))
* add round 3 floating window to the canvas viewer prototype ([#207](https://github.com/RAbdelrhman/wayfinder-map/issues/207)) ([05c5563](https://github.com/RAbdelrhman/wayfinder-map/commit/05c556350620c5d006cc9c172b4c006424a67518))
* add round 4 corner resizing to the canvas viewer prototype ([#207](https://github.com/RAbdelrhman/wayfinder-map/issues/207)) ([a04bf73](https://github.com/RAbdelrhman/wayfinder-map/commit/a04bf73cbc16fcf1cb53c9bfbe3e4253bc5508ae))
* prototype the in-app canvas viewer shell ([#207](https://github.com/RAbdelrhman/wayfinder-map/issues/207)) ([4067201](https://github.com/RAbdelrhman/wayfinder-map/commit/406720108421101343f750cb06530b806d642909))
* prototype the in-app canvas viewer shell ([#207](https://github.com/RAbdelrhman/wayfinder-map/issues/207)) ([1e2bc06](https://github.com/RAbdelrhman/wayfinder-map/commit/1e2bc06e7088522f82ac7d92416f8599b699f1e1))


### Bug Fixes

* guard update installation and shutdown handling ([#251](https://github.com/RAbdelrhman/wayfinder-map/issues/251)) ([762fe63](https://github.com/RAbdelrhman/wayfinder-map/commit/762fe639f0def415a810bcd92ec7c82081c14b46))
* keep the scrim and drop stale ghosts when a canvas reopens mid-close ([#207](https://github.com/RAbdelrhman/wayfinder-map/issues/207)) ([dd2302f](https://github.com/RAbdelrhman/wayfinder-map/commit/dd2302f28b5cd1070b19cb8699b8c86fb8b67f18))
* preserve Auto state and complete watched membership ([#252](https://github.com/RAbdelrhman/wayfinder-map/issues/252)) ([8167f95](https://github.com/RAbdelrhman/wayfinder-map/commit/8167f95bb619e87192fb9ba56821e2b0f0fe589e))
* preserve concurrent settings updates ([#245](https://github.com/RAbdelrhman/wayfinder-map/issues/245)) ([2dca11f](https://github.com/RAbdelrhman/wayfinder-map/commit/2dca11ff57b8ba7f82396124455c6ce5ee6c5334))
* preserve hand-off state across writers ([#246](https://github.com/RAbdelrhman/wayfinder-map/issues/246)) ([12dc103](https://github.com/RAbdelrhman/wayfinder-map/commit/12dc103c46421dbcd04efd6e2dc01a6f07000e25))
* preserve repository details and complete discovery ([#247](https://github.com/RAbdelrhman/wayfinder-map/issues/247)) ([c3b34e6](https://github.com/RAbdelrhman/wayfinder-map/commit/c3b34e69e4e02caad0d423da3742ee31aef2e922))
* preserve ticket choices and keyboard focus ([#248](https://github.com/RAbdelrhman/wayfinder-map/issues/248)) ([33be9ac](https://github.com/RAbdelrhman/wayfinder-map/commit/33be9ac7089de46c345353ed24246bf4d3b5801a))
* reject foreign hosts before serving app data ([#204](https://github.com/RAbdelrhman/wayfinder-map/issues/204)) ([890da90](https://github.com/RAbdelrhman/wayfinder-map/commit/890da903e65160b69c286db843e63606613178a6))
* restore doc encoding and apply review notes ([#219](https://github.com/RAbdelrhman/wayfinder-map/issues/219)) ([a003060](https://github.com/RAbdelrhman/wayfinder-map/commit/a0030600319cf266d592bde4fff59f9ec3326591))
* reuse established T3 sessions for sequential requests ([#250](https://github.com/RAbdelrhman/wayfinder-map/issues/250)) ([11f506b](https://github.com/RAbdelrhman/wayfinder-map/commit/11f506bbdd05722b6956bd011041921b3ec22419))
* settle clone actions after repository switches ([#249](https://github.com/RAbdelrhman/wayfinder-map/issues/249)) ([9514cd0](https://github.com/RAbdelrhman/wayfinder-map/commit/9514cd0c516801b46a3acebc0065fa796516f491))

## [0.2.12](https://github.com/RAbdelrhman/wayfinder-map/compare/v0.2.11...v0.2.12) (2026-10-03)


### Features

* add Settings to the sidebar, holding the account panel ([#114](https://github.com/RAbdelrhman/wayfinder-map/issues/114)) ([b65de94](https://github.com/RAbdelrhman/wayfinder-map/commit/b65de944095491656d7b0a91045e09bb544e97cb))
* add the configurable Home progress panel ([#80](https://github.com/RAbdelrhman/wayfinder-map/issues/80)) ([#85](https://github.com/RAbdelrhman/wayfinder-map/issues/85)) ([90f96a4](https://github.com/RAbdelrhman/wayfinder-map/commit/90f96a4464d91b0b7129d9dc3d5c70ec3ca7d64a))
* ask the user why an Auto session changed model ([d393207](https://github.com/RAbdelrhman/wayfinder-map/commit/d393207c0474243318be1e136ccb3d51787773a3))
* ask the user why an Auto session changed model ([221fb2d](https://github.com/RAbdelrhman/wayfinder-map/commit/221fb2d9ae12821781612a5c40a12ce2505451b2))
* auto map starts tickets as they become next ([b094d53](https://github.com/RAbdelrhman/wayfinder-map/commit/b094d53cd3b3f8002d2b03566061c28f8565d7ef))
* auto map starts tickets as they become next ([#164](https://github.com/RAbdelrhman/wayfinder-map/issues/164)) ([0b4ad2e](https://github.com/RAbdelrhman/wayfinder-map/commit/0b4ad2e1ef5ccdebb08eed4a3d7442d83dab401d))
* Auto picks each ticket's tier and model in Start next ([#166](https://github.com/RAbdelrhman/wayfinder-map/issues/166)) ([1caf9b3](https://github.com/RAbdelrhman/wayfinder-map/commit/1caf9b35c07f3392405a8a66015e0fbb35a3e2f4))
* Auto picks each ticket's tier and model in Start next ([#166](https://github.com/RAbdelrhman/wayfinder-map/issues/166)) ([fd9b6f0](https://github.com/RAbdelrhman/wayfinder-map/commit/fd9b6f022e8dd848b71c6c71181392461f84d7fc))
* browse and follow other people's public maps ([ed2a2b0](https://github.com/RAbdelrhman/wayfinder-map/commit/ed2a2b03ce531c43265c0e82ecd328881f03ca53))
* browse and follow other people's public maps ([c974e65](https://github.com/RAbdelrhman/wayfinder-map/commit/c974e659b7873879b3c059bba8ffa779f8521b3d))
* call off-map issues fog and count them in the map's totals ([#87](https://github.com/RAbdelrhman/wayfinder-map/issues/87)) ([f494e6a](https://github.com/RAbdelrhman/wayfinder-map/commit/f494e6aebdb12b882770b758adfb8bc6826fab43))
* compute each map's critical path on the snapshot ([#132](https://github.com/RAbdelrhman/wayfinder-map/issues/132)) ([7f86f9d](https://github.com/RAbdelrhman/wayfinder-map/commit/7f86f9d153cb92ad14984b466b61f60d4b230036)), closes [#126](https://github.com/RAbdelrhman/wayfinder-map/issues/126)
* detect stalled tickets, with a setting for each kind of stall ([8f85c3d](https://github.com/RAbdelrhman/wayfinder-map/commit/8f85c3d6e67c162a0a3a196c4ca9500937183f2a))
* detect stalled tickets, with a setting for each kind of stall ([#160](https://github.com/RAbdelrhman/wayfinder-map/issues/160)) ([b30ec1c](https://github.com/RAbdelrhman/wayfinder-map/commit/b30ec1ceb83365dd32fd7767d151a94cc54b4a73))
* draw off-map blockers as cards on the canvas ([4c19cce](https://github.com/RAbdelrhman/wayfinder-map/commit/4c19cce63cff0b61c5a43e46a175d533a6639be1))
* fog as a haze on graph cards, one status per card ([#117](https://github.com/RAbdelrhman/wayfinder-map/issues/117)) ([e715281](https://github.com/RAbdelrhman/wayfinder-map/commit/e7152811fce7284b97b1d127529de52151668eac))
* keep maps to chosen UI, take turns through Needs, verify before merge ([#197](https://github.com/RAbdelrhman/wayfinder-map/issues/197)) ([1016cbf](https://github.com/RAbdelrhman/wayfinder-map/commit/1016cbfef4c670a4839ee3840026809fa7b3b625))
* link blockers that live off the map ([5fd8c48](https://github.com/RAbdelrhman/wayfinder-map/commit/5fd8c48d1d8bf0ab3968dcca715f4979490fb41a))
* notify when map tickets need attention ([11767fa](https://github.com/RAbdelrhman/wayfinder-map/commit/11767fa3caefc63716314a3e0866671fedb954b1))
* notify when map tickets need attention ([36fb413](https://github.com/RAbdelrhman/wayfinder-map/commit/36fb41393f341bfa71b14a2ff65e31a9f4078521))
* open off-map issues in the panel like any ticket ([7e7ce14](https://github.com/RAbdelrhman/wayfinder-map/commit/7e7ce14add7d799e989902c1a46bc7cb22e0e76a))
* prototype what's next, what's in the way and stalled on the map ([#125](https://github.com/RAbdelrhman/wayfinder-map/issues/125)) ([#161](https://github.com/RAbdelrhman/wayfinder-map/issues/161)) ([b037c66](https://github.com/RAbdelrhman/wayfinder-map/commit/b037c660e5588bcebc8837c4fe65eddc4a8c7801))
* put off-map issues in bands above and below the map, zoom out freely ([18c1410](https://github.com/RAbdelrhman/wayfinder-map/commit/18c14102c5316cea911d6b0ac43a7790b67277c9))
* re-pick a queued Auto ticket's model when its provider becomes limited ([20ea9d8](https://github.com/RAbdelrhman/wayfinder-map/commit/20ea9d88427b734d0f8a79892f42b768b775dc8e))
* re-pick a queued Auto ticket's model when its provider becomes limited ([0d39749](https://github.com/RAbdelrhman/wayfinder-map/commit/0d3974996d7329049ec3719343698671271c1d88))
* read real provider usage so Auto can avoid a provider before it errors ([611a159](https://github.com/RAbdelrhman/wayfinder-map/commit/611a1599132a6db9c178cb4ae6f03955306f1460))
* read real provider usage so Auto can avoid a provider before it errors ([42b3826](https://github.com/RAbdelrhman/wayfinder-map/commit/42b3826e9582fb046f9c4195d92f7faf9dd61c68))
* record Auto tier decisions and hand-off outcomes for calibration ([4cfa305](https://github.com/RAbdelrhman/wayfinder-map/commit/4cfa3051ff06dbdd38c3ca46fd8e49c33c563738))
* record Auto tier decisions and hand-off outcomes locally ([cbe26ba](https://github.com/RAbdelrhman/wayfinder-map/commit/cbe26bae0aa05308ce256cfba7406a8a06020c41))
* record paired Auto predictions and rating measurements for calibration ([61075b5](https://github.com/RAbdelrhman/wayfinder-map/commit/61075b5c73aff17686f5dbbb59a2369d3cd9f197))
* record paired Auto predictions and rating measurements for calibration ([6602817](https://github.com/RAbdelrhman/wayfinder-map/commit/66028177e9da71f8b2d65930107ca87c0183f6dd))
* redesign repository and prototypes views ([#89](https://github.com/RAbdelrhman/wayfinder-map/issues/89)) ([30eee13](https://github.com/RAbdelrhman/wayfinder-map/commit/30eee1397de6eb795b25f8b8cf6fb7ac2149d6ca))
* redesign the Home landing view ([#88](https://github.com/RAbdelrhman/wayfinder-map/issues/88)) ([e5cac2e](https://github.com/RAbdelrhman/wayfinder-map/commit/e5cac2ecc1ed5069eecdafb45ec48c2355efe7c8))
* redesign the start a new map flow ([#86](https://github.com/RAbdelrhman/wayfinder-map/issues/86)) ([dbcdf47](https://github.com/RAbdelrhman/wayfinder-map/commit/dbcdf47a0ac5f055f27d2c295420578be1f93dab))
* run the auto map trigger in the server so it works with no page open ([96b191b](https://github.com/RAbdelrhman/wayfinder-map/commit/96b191bd674f5fd21a946e802d1e17e0a3dc5520))
* run the auto map trigger in the server so it works with no page open ([c3eae58](https://github.com/RAbdelrhman/wayfinder-map/commit/c3eae5897e91cbbfbc2f0c755369c5c62f5d7a2f))
* settle old maps into a collapsed section that stops fetching them ([#154](https://github.com/RAbdelrhman/wayfinder-map/issues/154)) ([3552709](https://github.com/RAbdelrhman/wayfinder-map/commit/3552709a2e0fe694bbca88db230553b7a5daae2e))
* ship stable unsigned releases with reliable self-updates ([9ff2cec](https://github.com/RAbdelrhman/wayfinder-map/commit/9ff2cec3471ec616e75b7ae90bfc2338a9198a90))
* show check counts and reviewer for T3 Code PRs ([3e3f1f8](https://github.com/RAbdelrhman/wayfinder-map/commit/3e3f1f87ccb8d4a000abc6f55124214d3f32a8d0))
* show check counts and reviewer for T3 Code PRs from the fresh GitHub read ([5919a6b](https://github.com/RAbdelrhman/wayfinder-map/commit/5919a6b790245e1bd1b126796ced62a195e5ed74))
* show issues linked from outside the map ([#84](https://github.com/RAbdelrhman/wayfinder-map/issues/84)) ([38ae018](https://github.com/RAbdelrhman/wayfinder-map/commit/38ae01863a02e07f9f3b03f1afb83a5b891a20f8))
* show live T3 hand-off status ([da95a2e](https://github.com/RAbdelrhman/wayfinder-map/commit/da95a2e936cec63e5cc23e14030e622dbf3dbd84))
* show live T3 hand-off status ([dd070b8](https://github.com/RAbdelrhman/wayfinder-map/commit/dd070b8b2b16ba1a89c2994da7084ee923e9f682))
* show only my maps and the public maps I follow ([6258b63](https://github.com/RAbdelrhman/wayfinder-map/commit/6258b634fc97fe6b736f6e6408652f133e4e7f39))
* show only my maps and the public maps I follow ([df07b2d](https://github.com/RAbdelrhman/wayfinder-map/commit/df07b2dfcd31e13ea56086cbc9bf66e78c77ab9f))
* show only Wayfinder repositories in the sidebar and on Home, most recent first ([#109](https://github.com/RAbdelrhman/wayfinder-map/issues/109)) ([fadcb55](https://github.com/RAbdelrhman/wayfinder-map/commit/fadcb55d652b1ea50cab318a6e8115b3be2bd3da)), closes [#99](https://github.com/RAbdelrhman/wayfinder-map/issues/99)
* show the critical path, PR and CI state, and stalled tickets on the map ([#130](https://github.com/RAbdelrhman/wayfinder-map/issues/130)) ([6077de5](https://github.com/RAbdelrhman/wayfinder-map/commit/6077de5720011795ac1d3f804edfd0b98243cc6d))
* show the critical path, PR and CI state, and stalled tickets on the map ([#130](https://github.com/RAbdelrhman/wayfinder-map/issues/130)) ([4d41779](https://github.com/RAbdelrhman/wayfinder-map/commit/4d41779e21d30a25c5faefdf05d99f8c16c27880))
* Start next hands off every next ticket at once ([308c740](https://github.com/RAbdelrhman/wayfinder-map/commit/308c74076c9af3755b37339fc1e781a3636f80c8))
* start next hands off every next ticket at once ([#129](https://github.com/RAbdelrhman/wayfinder-map/issues/129)) ([210e5fa](https://github.com/RAbdelrhman/wayfinder-map/commit/210e5fa4ff832581b560bb1109d98a75e41ea2ae))
* take map watcher PR state from T3 Code first ([d7e334e](https://github.com/RAbdelrhman/wayfinder-map/commit/d7e334eefe0da11b3fc13ed96b95d7637a90f20b))
* take map watcher PR state from T3 Code first ([3f561fc](https://github.com/RAbdelrhman/wayfinder-map/commit/3f561fcc0da3315704e58eafe810bcb2455158d1))
* watch every opened map and catch up after quit ([2a2a729](https://github.com/RAbdelrhman/wayfinder-map/commit/2a2a729c2f41d720a2555e4ec61a17e3a67a5124))
* watch maps for changes and emit events ([#141](https://github.com/RAbdelrhman/wayfinder-map/issues/141)) ([69862e0](https://github.com/RAbdelrhman/wayfinder-map/commit/69862e0ed7654b84d5bbebe8d489f6aacc5ea258))
* watch opened maps and catch up after quit ([b210ad4](https://github.com/RAbdelrhman/wayfinder-map/commit/b210ad4853c35e915efc4b602e1940ee6d5e7705))


### Bug Fixes

* call the off-map group fog on the map canvas ([#106](https://github.com/RAbdelrhman/wayfinder-map/issues/106)) ([0739d88](https://github.com/RAbdelrhman/wayfinder-map/commit/0739d880995283656ea59f67adc42d6cf45bd6da))
* claim the canvas press so click-and-drag always pans ([#136](https://github.com/RAbdelrhman/wayfinder-map/issues/136)) ([4ff6665](https://github.com/RAbdelrhman/wayfinder-map/commit/4ff66657d999ac0c5a9ea0eba3e451b9ebeffa55))
* don't start a second hand-off for a ticket that already has one running ([#111](https://github.com/RAbdelrhman/wayfinder-map/issues/111)) ([ee3f337](https://github.com/RAbdelrhman/wayfinder-map/commit/ee3f337bb5bfbaa3b6f8fe2373ff0f0b4c334dac)), closes [#98](https://github.com/RAbdelrhman/wayfinder-map/issues/98)
* drop hand-offs whose T3 Code thread was deleted ([#108](https://github.com/RAbdelrhman/wayfinder-map/issues/108)) ([44a41a9](https://github.com/RAbdelrhman/wayfinder-map/commit/44a41a927c30cd18977338319d5417180e6d664b)), closes [#97](https://github.com/RAbdelrhman/wayfinder-map/issues/97)
* fill the outside bands from the left so their cards are in view ([0a47221](https://github.com/RAbdelrhman/wayfinder-map/commit/0a47221d2f5194cb9186f4711cf965f2e06858f1))
* give the ticket panel tabs full ARIA and make the table view keyboard scrollable ([#118](https://github.com/RAbdelrhman/wayfinder-map/issues/118)) ([7ca8cb7](https://github.com/RAbdelrhman/wayfinder-map/commit/7ca8cb73d9ffb03a2a4c6aba1013e799a0584ffd))
* handle colored GitHub CLI output ([#82](https://github.com/RAbdelrhman/wayfinder-map/issues/82)) ([191812b](https://github.com/RAbdelrhman/wayfinder-map/commit/191812b23adc742d9277fd819b2fff69c5b48125))
* include map body tickets missing sub-issues ([ee2660f](https://github.com/RAbdelrhman/wayfinder-map/commit/ee2660f50c9b5451a7e62ef5250318429808d52e))
* include map body tickets missing sub-issues ([3230e0c](https://github.com/RAbdelrhman/wayfinder-map/commit/3230e0cd0bab77d544820931052f8dec97987da5))
* keep installer smoke from replacing an existing app ([#83](https://github.com/RAbdelrhman/wayfinder-map/issues/83)) ([6319fba](https://github.com/RAbdelrhman/wayfinder-map/commit/6319fba8e68f4ca0ae0b3ae47e64eeace50c19d3))
* keep usage-limit error text out of the hand-off store ([c54ecba](https://github.com/RAbdelrhman/wayfinder-map/commit/c54ecba02c1a2f01230a7fa75625ee3b31432fbf))
* keep usage-limit error text out of the hand-off store ([add8462](https://github.com/RAbdelrhman/wayfinder-map/commit/add84624c4ee599b73ac745de8873eaa2c7d26d1)), closes [#179](https://github.com/RAbdelrhman/wayfinder-map/issues/179)
* let tests pass their own T3 Code runtime, and set version 0.2.12-beta.2 ([d42f1aa](https://github.com/RAbdelrhman/wayfinder-map/commit/d42f1aaf1f55633c3980e07684ab61a81efbe6b2))
* let tests pass their own T3 Code runtime, and set version 0.2.12-beta.2 ([220ab7b](https://github.com/RAbdelrhman/wayfinder-map/commit/220ab7b4f455a7e0bdcb996121f375c668583aff))
* line up the Start a new map composer ([#112](https://github.com/RAbdelrhman/wayfinder-map/issues/112)) ([359067d](https://github.com/RAbdelrhman/wayfinder-map/commit/359067d1bd5d1e9ec1c7bffed4062b005672259d)), closes [#103](https://github.com/RAbdelrhman/wayfinder-map/issues/103)
* make loading skeletons match the loaded pages ([#115](https://github.com/RAbdelrhman/wayfinder-map/issues/115)) ([cd38926](https://github.com/RAbdelrhman/wayfinder-map/commit/cd389263f52c32cbe80406f650c78ae893284395))
* make map background refresh conditional ([#152](https://github.com/RAbdelrhman/wayfinder-map/issues/152)) ([4b655fa](https://github.com/RAbdelrhman/wayfinder-map/commit/4b655fa1ade250fb8e71eccf318073df51a51fcc))
* meet WCAG AA contrast on the redesigned pages and open topbar menus on click ([#96](https://github.com/RAbdelrhman/wayfinder-map/issues/96)) ([157bd51](https://github.com/RAbdelrhman/wayfinder-map/commit/157bd5157bd78d9c54d77d57a25042b912e17b55))
* paginate map issue discovery ([aa85353](https://github.com/RAbdelrhman/wayfinder-map/commit/aa85353c9eaf9d811b2fd1576bee51dde5f36dba))
* paginate map issue discovery ([723e2e6](https://github.com/RAbdelrhman/wayfinder-map/commit/723e2e62d28bbc2e0bedc1546f4e2b881c4e443b))
* preserve concurrent hand-off store writes ([#157](https://github.com/RAbdelrhman/wayfinder-map/issues/157)) ([692901e](https://github.com/RAbdelrhman/wayfinder-map/commit/692901ecf8e01c2afe2a3856992da123a107f97f))
* rank a live retry above the finished hand-off before it ([#113](https://github.com/RAbdelrhman/wayfinder-map/issues/113)) ([7bfa7b0](https://github.com/RAbdelrhman/wayfinder-map/commit/7bfa7b09cd0603135589f6af05afaeca247762aa)), closes [#98](https://github.com/RAbdelrhman/wayfinder-map/issues/98)
* read PR status from T3 snapshots ([#150](https://github.com/RAbdelrhman/wayfinder-map/issues/150)) ([6d218a1](https://github.com/RAbdelrhman/wayfinder-map/commit/6d218a140cac6aee05e722ec93d47ab50f26844a))
* read T3 PR state for frontier hand-offs and keep the newest snapshot ([95735f4](https://github.com/RAbdelrhman/wayfinder-map/commit/95735f4a3b44d1cf1f8a80ed9e1a1b666c378e16))
* restore Home stylesheet rules ([#91](https://github.com/RAbdelrhman/wayfinder-map/issues/91)) ([7c9a304](https://github.com/RAbdelrhman/wayfinder-map/commit/7c9a304eea897a1eae0a2d31503dbd4623fd5451))
* reword warnings in plain language ([#119](https://github.com/RAbdelrhman/wayfinder-map/issues/119)) ([9fa7186](https://github.com/RAbdelrhman/wayfinder-map/commit/9fa718642fbc5a733755b0b0e9cc87acfae9b56c))
* serialize concurrent same-clone hand-offs ([#159](https://github.com/RAbdelrhman/wayfinder-map/issues/159)) ([3a27e55](https://github.com/RAbdelrhman/wayfinder-map/commit/3a27e5507ecaaf86f984d42c6d1e05b83ca38158))
* share in-flight T3 Code connections across hand-offs ([36cbe69](https://github.com/RAbdelrhman/wayfinder-map/commit/36cbe69c87e6e738e3492fe7fc06c438baf31ff4))
* share in-flight T3 Code connections across hand-offs ([a1e026d](https://github.com/RAbdelrhman/wayfinder-map/commit/a1e026d928a46ea90212f25ebe9aa43ab5122370))
* ship the approved prototype looks for Home, repository, Prototypes and navigation ([#93](https://github.com/RAbdelrhman/wayfinder-map/issues/93)) ([48a457a](https://github.com/RAbdelrhman/wayfinder-map/commit/48a457a39e05fc7a2c441ab529968b707ee101cd))
* show an open ticket's own state once its hand-off merged ([#195](https://github.com/RAbdelrhman/wayfinder-map/issues/195)) ([6d5c2c2](https://github.com/RAbdelrhman/wayfinder-map/commit/6d5c2c242b63d247affa5a15530c9f4c7e1d9dbf))
* show done on every closed map card, not Merged ([#120](https://github.com/RAbdelrhman/wayfinder-map/issues/120)) ([031aaae](https://github.com/RAbdelrhman/wayfinder-map/commit/031aaae4444bfd8de279e490d6b7ff11ce356f7f))
* show hand-offs as done once their ticket closes ([6a225a9](https://github.com/RAbdelrhman/wayfinder-map/commit/6a225a96942df62dcb9c0a0fd5f8634b53b2a0c3))
* show merged hand-offs as Merged and tidy Home's recent hand-offs ([#116](https://github.com/RAbdelrhman/wayfinder-map/issues/116)) ([a03a7be](https://github.com/RAbdelrhman/wayfinder-map/commit/a03a7be87b62de63004691a88879e25d5eac875e))
* show one hand-off per ticket, the thread that is actually running ([#107](https://github.com/RAbdelrhman/wayfinder-map/issues/107)) ([fbd37cb](https://github.com/RAbdelrhman/wayfinder-map/commit/fbd37cb8bcb15f38f5b8f31995629716faf2bdbe)), closes [#94](https://github.com/RAbdelrhman/wayfinder-map/issues/94)
* show organization logos in Home's repository search ([#110](https://github.com/RAbdelrhman/wayfinder-map/issues/110)) ([b897d5d](https://github.com/RAbdelrhman/wayfinder-map/commit/b897d5def04ba9fda18119c696b388a1abed46cb)), closes [#100](https://github.com/RAbdelrhman/wayfinder-map/issues/100)
* skip the compile-cache preload when finding the T3 Code server script ([#131](https://github.com/RAbdelrhman/wayfinder-map/issues/131)) ([c032cfe](https://github.com/RAbdelrhman/wayfinder-map/commit/c032cfe62c18306ba1068895cfac3da0ecfb54fd))

## [0.2.11](https://github.com/RAbdelrhman/wayfinder-map/compare/v0.2.10...v0.2.11) (2026-09-23)


### Features

* improve prototype canvas feedback loop ([#77](https://github.com/RAbdelrhman/wayfinder-map/issues/77)) ([455d380](https://github.com/RAbdelrhman/wayfinder-map/commit/455d380031526c204c9f34e62aabcfd29899c306))
* prototype after-hand-off experience for T3 Code ([#45](https://github.com/RAbdelrhman/wayfinder-map/issues/45)) ([#79](https://github.com/RAbdelrhman/wayfinder-map/issues/79)) ([704d88c](https://github.com/RAbdelrhman/wayfinder-map/commit/704d88c5e1e1d8e5e78ef79aa21bdb1898e9071a))
* prototype Home, repository and Prototypes views ([#43](https://github.com/RAbdelrhman/wayfinder-map/issues/43)) ([#78](https://github.com/RAbdelrhman/wayfinder-map/issues/78)) ([999939b](https://github.com/RAbdelrhman/wayfinder-map/commit/999939b17d8b6d8b3a7b6f1e1e3127c30891be26))


### Bug Fixes

* hide models the user turned off in T3 Code ([#75](https://github.com/RAbdelrhman/wayfinder-map/issues/75)) ([a67f75f](https://github.com/RAbdelrhman/wayfinder-map/commit/a67f75f6f49aad03c82d21ef5fac4cbe5caa9fc2))

## [0.2.10](https://github.com/RAbdelrhman/wayfinder-map/compare/v0.2.9...v0.2.10) (2026-09-22)


### Bug Fixes

* show monogram for personal repos and stop serving stale repo icons ([68b8882](https://github.com/RAbdelrhman/wayfinder-map/commit/68b8882c39a3470eb4f4736fabde0e1de88a3815))

## [0.2.9](https://github.com/RAbdelrhman/wayfinder-map/compare/v0.2.8...v0.2.9) (2026-09-22)


### Bug Fixes

* **desktop:** serve on a stable port so saved settings survive restarts ([#70](https://github.com/RAbdelrhman/wayfinder-map/issues/70)) ([d1d6f39](https://github.com/RAbdelrhman/wayfinder-map/commit/d1d6f39b0997844c02ccd3404bb1957b5911b8eb))
* harden Windows desktop packaging and installed smoke verification ([#72](https://github.com/RAbdelrhman/wayfinder-map/issues/72)) ([b736b03](https://github.com/RAbdelrhman/wayfinder-map/commit/b736b0397163f90edcc02540b95e6d48d626fed0))
* restore GitHub avatar and repository images ([83bfc26](https://github.com/RAbdelrhman/wayfinder-map/commit/83bfc26f5285b51ed9e5d6ddf318e7e2bcb73333))
* source avatars from GitHub metadata ([266c12c](https://github.com/RAbdelrhman/wayfinder-map/commit/266c12c2444dc647f9ecc5517bffeeae8c5b3461))

## [0.2.8](https://github.com/RAbdelrhman/wayfinder-map/compare/v0.2.7...v0.2.8) (2026-09-21)


### Features

* add clickable prototype gallery and simplify CLI packaging ([#61](https://github.com/RAbdelrhman/wayfinder-map/issues/61)) ([d741c41](https://github.com/RAbdelrhman/wayfinder-map/commit/d741c41cab0be53600ca76c7dd3158d35d03f19c))
