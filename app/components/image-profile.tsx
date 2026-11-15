'use client';
import {imageReviewRoute,imageModelLabel} from '@/packages/medical-images/routing';
import {IMAGE_PROFILES,type ImageProfile} from '@/packages/medical-images/profiles';
import {useWorkspaceLanguage} from './workspace-language';
export function ImageProfileSelect({value,onChange,disabled}:{value:ImageProfile;onChange:(value:ImageProfile)=>void;disabled?:boolean}){const {t}=useWorkspaceLanguage();return <label>{t('Тип медицинского изображения')}<select disabled={disabled} value={value} onChange={e=>onChange(e.target.value as ImageProfile)}>{IMAGE_PROFILES.map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select><small>{imageModelLabel(imageReviewRoute(value).primary)} → {imageModelLabel(imageReviewRoute(value).secondary)} ({t('Второе мнение')})</small><small>{t('Выберите профиль, если он известен. Приложение проверит содержимое изображения и отметит ограничения.')}</small></label>;}
