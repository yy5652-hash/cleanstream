export const stationDemoUrl = (city: string) => `${import.meta.env.BASE_URL}?kiosk&source=demo&city=${encodeURIComponent(city)}`
