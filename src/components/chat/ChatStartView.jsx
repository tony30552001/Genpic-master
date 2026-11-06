import { Link } from "react-router-dom";

const RECENT_LIMIT = 9;

const captionOf = (item) => (item.userScript || item.prompt || "未命名作品").trim();

/**
 * Empty chat state: a centered composer (passed as `children`) above the
 * user's recent images; picking one attaches it so the next message edits it.
 */
export default function ChatStartView({ children, historyItems, onContinue }) {
  const recent = historyItems.filter((item) => item.imageUrl).slice(0, RECENT_LIMIT);

  return (
    <section aria-label="對話創作" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-16 pt-[8svh] lg:px-6 lg:pt-[14svh]">
        <h1 className="mb-6 text-balance text-center text-lg font-semibold tracking-tight lg:text-xl">
          今天想做一張什麼樣的圖？
        </h1>
        {children}

        {recent.length > 0 && (
          <div className="mt-12 lg:mt-14">
            <div className="mb-3.5 flex items-baseline justify-between gap-3 px-0.5">
              <h2 className="text-[15px] font-semibold">我的近期作品</h2>
              <Link
                to="/library?section=images"
                className="shrink-0 rounded-sm text-[13px] text-muted-foreground transition-colors duration-(--motion-hover) ease-emphasized hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                在素材中心查看全部
              </Link>
            </div>
            <ul className="columns-2 gap-2.5 sm:columns-3">
              {recent.map((item) => {
                const caption = captionOf(item);
                return (
                  <li key={item.id} className="mb-2.5 break-inside-avoid">
                    <button
                      type="button"
                      onClick={() => onContinue(item)}
                      aria-label={`接續修改：${caption}`}
                      className="group/tile relative block w-full overflow-hidden rounded-[14px] bg-muted text-left press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        className="block h-auto w-full transition-transform duration-500 ease-emphasized group-hover/tile:scale-[1.03] motion-reduce:transition-none"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-3 pb-2.5 pt-7 text-[13px] font-medium text-white">
                        <span className="line-clamp-1">{caption}</span>
                        <span className="block translate-y-1 text-xs font-normal opacity-0 transition duration-(--motion-hover) ease-emphasized group-hover/tile:translate-y-0 group-hover/tile:opacity-85 group-focus-visible/tile:translate-y-0 group-focus-visible/tile:opacity-85 motion-reduce:transition-none">
                          點一下接續修改
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
