const routeModule = await import(
  `../src/hana/plugin/routes/status.ts?t=${Date.now()}`
)

export default routeModule.default
