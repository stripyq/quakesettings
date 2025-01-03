export default function InfographicPage() {
  return (
    <div className="flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-6">QL players snapshot 2024</h1>
      <div className="w-full max-w-[2500px] relative">
        <img
          src="/quakesettings/useful/infographic.png"
          alt="HoQ Infographic"
          className="w-full h-auto"
          loading="lazy"
          key="infographic"
        />
      </div>
    </div>
  );
}

