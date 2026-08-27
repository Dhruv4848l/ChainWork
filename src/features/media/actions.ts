"use server";

import { revalidatePath } from "next/cache";
import { platformDb } from "@/lib/platformDb";
import { requireUser, requireRole } from "@/lib/auth/guards";
import { uploadImage } from "@/lib/cloudinary";

/*
  Image-upload server actions. The browser posts a file to these; the server
  uploads it to Cloudinary (secret stays server-side) and stores only the URL:
  - avatar         -> User.avatarUrl (any signed-in user)
  - portfolio/proof-> WorkerProfile.portfolioImages[] (workers)
*/
export interface MediaState {
  error?: string;
  ok?: boolean;
  url?: string;
}

function fileFrom(formData: FormData): File | null {
  const f = formData.get("file");
  return f instanceof File && f.size > 0 ? f : null;
}

export async function uploadAvatarAction(
  _prev: MediaState,
  formData: FormData
): Promise<MediaState> {
  const user = await requireUser();
  const file = fileFrom(formData);
  if (!file) return { error: "Choose an image first." };
  try {
    const { url } = await uploadImage(file, "chainwork/avatars");
    await platformDb.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
    revalidatePath("/dashboard/worker/profile");
    revalidatePath("/dashboard/worker/profile/edit");
    revalidatePath("/dashboard/client/profile");
    return { ok: true, url };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function uploadPortfolioImageAction(
  _prev: MediaState,
  formData: FormData
): Promise<MediaState> {
  const user = await requireRole("WORKER");
  const file = fileFrom(formData);
  if (!file) return { error: "Choose an image first." };
  try {
    const { url } = await uploadImage(file, "chainwork/portfolio");
    await platformDb.workerProfile.update({
      where: { userId: user.id },
      data: { portfolioImages: { push: url } },
    });
    revalidatePath("/dashboard/worker/profile");
    revalidatePath("/dashboard/worker/profile/edit");
    return { ok: true, url };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function removePortfolioImageAction(url: string): Promise<void> {
  const user = await requireRole("WORKER");
  const wp = await platformDb.workerProfile.findUnique({
    where: { userId: user.id },
    select: { portfolioImages: true },
  });
  if (!wp) return;
  await platformDb.workerProfile.update({
    where: { userId: user.id },
    data: { portfolioImages: wp.portfolioImages.filter((u) => u !== url) },
  });
  revalidatePath("/dashboard/worker/profile");
  revalidatePath("/dashboard/worker/profile/edit");
}
